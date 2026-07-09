import { ipcMain, BrowserWindow, app, dialog, shell } from 'electron';
import { autoUpdater, UpdateInfo } from 'electron-updater';

const RELEASE_URL = 'https://github.com/Kkzaz/CIGE/releases/latest';

function isMacOSSignatureError(message: string): boolean {
  if (process.platform !== 'darwin') return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('signature') ||
    lower.includes('did not pass validation') ||
    lower.includes('codesign') ||
    lower.includes('code signature') ||
    lower.includes('不含资源') ||
    lower.includes('签名')
  );
}

function showMacOSSignatureDialog(win: BrowserWindow, version?: string): void {
  dialog
    .showMessageBox(win, {
      type: 'warning',
      title: 'macOS 自动更新需要应用签名',
      message: version ? `词歌 v${version} 已发布，但当前应用未进行 Apple 代码签名。` : '当前应用未进行 Apple 代码签名。',
      detail: 'macOS 的自动更新机制要求应用经过有效签名。请前往 GitHub Releases 页面手动下载最新版本安装包。',
      buttons: ['前往 GitHub 下载', '关闭'],
      defaultId: 0,
      cancelId: 1,
    })
    .then(({ response }) => {
      if (response === 0) {
        shell.openExternal(RELEASE_URL);
      }
    })
    .catch(() => {
      // ignore
    });
}

export function registerUpdateHandlers(getMainWindow: () => BrowserWindow | null): void {
  function sendUpdateStatus(status: string, payload?: unknown): void {
    getMainWindow()?.webContents.send('update-status', status, payload);
  }

  autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'));
  autoUpdater.on('update-available', (info: UpdateInfo) => sendUpdateStatus('available', info));
  autoUpdater.on('update-not-available', (info: UpdateInfo) => sendUpdateStatus('not-available', info));
  autoUpdater.on('error', (err: Error) => {
    const message = err.message || String(err);
    if (isMacOSSignatureError(message)) {
      const win = getMainWindow();
      if (win) {
        showMacOSSignatureDialog(win);
      }
      sendUpdateStatus('macos-signature-error', message);
      return;
    }
    sendUpdateStatus('error', message);
  });
  autoUpdater.on('download-progress', (progress) => sendUpdateStatus('progress', progress));
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    sendUpdateStatus('downloaded', info);
    const win = getMainWindow();
    if (!win) return;
    dialog
      .showMessageBox(win, {
        type: 'info',
        title: '更新已就绪',
        message: `词歌 v${info.version} 已下载完成`,
        detail: '点击「立即重启」安装更新，或选择「稍后」在退出应用时自动安装。',
        buttons: ['立即重启', '稍后'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      })
      .catch(() => {
        // ignore
      });
  });

  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) {
      return { skipped: true, message: '开发环境跳过更新检查' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { checking: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[AutoUpdate] 检查更新失败:', message);
      throw new Error(message);
    }
  });

  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[AutoUpdate] 下载更新失败:', message);
      throw new Error(message);
    }
  });

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall();
    return true;
  });
}
