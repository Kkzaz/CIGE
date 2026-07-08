import http from 'http';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';

export const LOCAL_SERVICE_PORT = process.env.CIGE_RHYME_PORT || '8792';
const LOCAL_SERVICE_START_TIMEOUT = 30000;

let localServiceProcess: ChildProcess | null = null;

export function isLocalServiceRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${LOCAL_SERVICE_PORT}/`, { timeout: 3000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function waitForLocalService(): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < LOCAL_SERVICE_START_TIMEOUT) {
    if (await isLocalServiceRunning()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function getToolsDirectory(): string {
  // 开发环境：进程当前工作目录即为项目根目录
  const cwdTools = path.join(process.cwd(), 'tools');
  if (fs.existsSync(cwdTools)) {
    return cwdTools;
  }

  // 生产环境：tools 已通过 asarUnpack 释放在 resources/app.asar.unpacked/tools
  const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'tools');
  if (fs.existsSync(unpackedPath)) {
    return unpackedPath;
  }

  // 兼容非 asar 或不同打包结构
  const appToolsPath = path.join(app.getAppPath(), 'tools');
  if (fs.existsSync(appToolsPath)) {
    return appToolsPath;
  }

  const resourcesToolsPath = path.join(process.resourcesPath, 'tools');
  if (fs.existsSync(resourcesToolsPath)) {
    return resourcesToolsPath;
  }

  return cwdTools;
}

export function startLocalService(): Promise<boolean> {
  return new Promise((resolve) => {
    const toolsDir = getToolsDirectory();
    const scriptPath = path.join(toolsDir, 'rhyme_server.py');

    if (!fs.existsSync(scriptPath)) {
      console.log('[LocalService] 未找到 Python 服务脚本:', scriptPath);
      resolve(false);
      return;
    }

    const env = {
      ...process.env,
      REDFOX_API_KEY: process.env.REDFOX_API_KEY || '',
    };

    console.log('[LocalService] 正在启动 Python 本地数据服务...');
    localServiceProcess = spawn('python3', [scriptPath], {
      cwd: toolsDir,
      env,
      stdio: 'pipe',
      detached: false,
    });

    localServiceProcess.stdout?.on('data', (data) => {
      console.log(`[LocalService] ${data.toString().trim()}`);
    });
    localServiceProcess.stderr?.on('data', (data) => {
      console.error(`[LocalService] ${data.toString().trim()}`);
    });
    localServiceProcess.on('error', (err) => {
      console.log('[LocalService] 启动失败:', err.message);
      resolve(false);
    });
    localServiceProcess.on('exit', (code) => {
      console.log(`[LocalService] 进程退出，code=${code}`);
      localServiceProcess = null;
    });

    waitForLocalService().then(resolve);
  });
}

export async function ensureLocalService(): Promise<boolean> {
  if (await isLocalServiceRunning()) {
    console.log('[LocalService] 本地数据服务已在运行');
    return true;
  }
  return startLocalService();
}

export function killLocalService(): void {
  if (localServiceProcess && !localServiceProcess.killed) {
    console.log('[LocalService] 正在关闭本地数据服务...');
    localServiceProcess.kill();
    localServiceProcess = null;
  }
}

export function fetchJsonFromLocalService<T>(url: string): Promise<T | null> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 20000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}
