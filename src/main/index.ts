import { app, BrowserWindow, ipcMain, shell, session } from 'electron';
import path from 'path';
import http from 'http';
import fs from 'fs';
import { autoUpdater } from 'electron-updater';
import { initDatabase, closeDatabase, getDatabase } from './database';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './global-shortcut';

import { registerWritingHandlers } from './handlers/writing';
import { registerExcerptHandlers } from './handlers/excerpt';
import { registerInspirationHandlers } from './handlers/inspiration';
import { registerBookHandlers } from './handlers/book';
import { registerBookSourceHandlers } from './handlers/bookSource';
import { registerFolderHandlers } from './handlers/folder';
import { registerRecycleHandlers } from './handlers/recycle';
import { registerSettingsHandlers } from './handlers/settings';
import { registerUpdateHandlers } from './handlers/update';
import { registerGeminiHandlers } from './handlers/gemini';

import { ensureLocalService, killLocalService } from './services/rhymeServer';
import { cancelAllImports } from './services/bookImportService';

let mainWindow: BrowserWindow | null = null;

// Auto updater configuration
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Disable GPU acceleration on macOS to prevent GPU process crashes
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('disable-software-rasterizer');
}

// Ignore EPIPE errors when stdout/stderr pipes are closed (e.g. dev server restart)
function ignoreEpipe(err: Error & { code?: string }): void {
  if (err.code !== 'EPIPE') {
    // eslint-disable-next-line no-console
    console.error('stream error:', err);
  }
}
process.stdout.on('error', ignoreEpipe);
process.stderr.on('error', ignoreEpipe);

function readVitePortFromFile(): number | null {
  try {
    const portFile = path.join(process.cwd(), '.vite-port');
    if (fs.existsSync(portFile)) {
      const content = fs.readFileSync(portFile, 'utf-8').trim();
      const port = parseInt(content, 10);
      if (!isNaN(port) && port > 0) {
        return port;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function probeDevServerPort(basePort: number): Promise<number> {
  return new Promise((resolve) => {
    let port = basePort;
    const tryPort = () => {
      if (port > basePort + 20) {
        console.log(`[Dev] 未找到可用 Vite 端口，回退到 ${basePort}`);
        resolve(basePort);
        return;
      }
      const req = http.get(`http://localhost:${port}/`, { timeout: 200 }, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          console.log(`[Dev] 使用 Vite 端口 ${port}`);
          resolve(port);
        } else {
          port++;
          tryPort();
        }
      });
      req.on('error', () => {
        port++;
        tryPort();
      });
      req.on('timeout', () => {
        req.destroy();
        port++;
        tryPort();
      });
    };
    tryPort();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findDevServerPort(basePort: number): Promise<number> {
  // 等待 Vite 启动并写入端口文件，最多等待 10 秒
  for (let i = 0; i < 40; i++) {
    const filePort = readVitePortFromFile();
    if (filePort) {
      console.log(`[Dev] 从文件读取到 Vite 端口 ${filePort}`);
      return filePort;
    }
    await delay(250);
  }
  console.log('[Dev] 未找到端口文件，开始探测端口');
  return probeDevServerPort(basePort);
}

async function createMainWindow(): Promise<BrowserWindow> {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'build', 'icon.png')
    : path.join(__dirname, '..', '..', 'build', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '词歌 CiGe',
    icon: iconPath,
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#F2F2F4',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.platform === 'darwin' && !app.isPackaged && fs.existsSync(iconPath)) {
    app.dock.setIcon(iconPath);
  }

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  console.log(`[Dev] app.isPackaged=${app.isPackaged}, NODE_ENV=${process.env.NODE_ENV}, isDev=${isDev}`);
  if (isDev) {
    const basePort = parseInt(process.env.VITE_PORT || '5173', 10);
    const port = await findDevServerPort(basePort);
    const url = `http://localhost:${port}`;
    console.log(`[Dev] 加载渲染进程: ${url}`);
    mainWindow.loadURL(url);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../..', 'renderer', 'index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    console.log(`[Window] 页面加载完成: ${mainWindow?.webContents.getURL()}`);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Window] 页面加载失败: ${validatedURL}`, errorCode, errorDescription);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function registerIpcHandlers(): void {
  const db = getDatabase();

  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('app:open-external', (_, url: string) => {
    shell.openExternal(url);
  });

  ipcMain.handle('window:set-reader-active', (_, active: boolean) => {
    const win = getMainWindow();
    if (!win) return;
    // macOS: hide traffic lights while in fullscreen reader
    if (typeof win.setWindowButtonVisibility === 'function') {
      win.setWindowButtonVisibility(!active);
    }
  });

  registerWritingHandlers(db);
  registerExcerptHandlers(db);
  registerInspirationHandlers(db);
  registerBookHandlers(db);
  registerBookSourceHandlers(db);
  registerFolderHandlers(db);
  registerRecycleHandlers(db);
  registerSettingsHandlers();
  registerUpdateHandlers(getMainWindow);
  registerGeminiHandlers();
}

app.whenReady().then(async () => {
  initDatabase();
  registerIpcHandlers();

  // 允许渲染进程申请麦克风权限（摘抄录音）
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media';
  });

  // 确保本地 Python 数据服务已启动（会自动传递 REDFOX_API_KEY）
  await ensureLocalService();

  const win = await createMainWindow();
  registerGlobalShortcuts(win);

  // 启动后延迟检查更新
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err: Error) => {
        console.log('[AutoUpdate] 启动检查失败:', err.message);
      });
    }, 5000);
  }
});

app.on('before-quit', () => {
  cancelAllImports();
});

app.on('window-all-closed', () => {
  unregisterGlobalShortcuts();
  closeDatabase();
  killLocalService();
  app.quit();
});

app.on('activate', async () => {
  if (mainWindow === null) {
    const win = await createMainWindow();
    registerGlobalShortcuts(win);
  }
});
