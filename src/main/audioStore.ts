import { app } from 'electron';
import fs from 'fs';
import path from 'path';

const AUDIO_DIR_NAME = 'audio';

export function getAudioDir(): string {
  // 开发环境用项目目录规避 TCC 对 --no-sandbox 进程的写限制；
  // 生产环境用 userData（打包后签名正常，沙箱可写）
  // 注意：app.getAppPath() 在开发环境返回 dist/main/main/，不是项目根目录，
  // 所以用 process.cwd() 确保指向项目根目录
  const base = process.env.NODE_ENV === 'development' && !app.isPackaged
    ? process.cwd()
    : app.getPath('userData');
  const dir = path.join(base, AUDIO_DIR_NAME);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // 某些环境下（如 --no-sandbox 启动）目录权限可能受限，确保可写
  try { fs.chmodSync(dir, 0o755); } catch { /* ignore */ }
  return dir;
}

export function resolveAudioPath(rel: string): string {
  return path.join(getAudioDir(), rel);
}

export function saveAudioFile(excerptId: number, buffer: ArrayBuffer): string {
  const dir = getAudioDir();
  const filename = `${excerptId}_${Date.now()}.webm`;
  const filePath = path.join(dir, filename);
  // 显式以 0o644 创建，规避部分环境下默认 umask/TCC 拦截
  const fd = fs.openSync(filePath, 'w', 0o644);
  try {
    fs.writeSync(fd, Buffer.from(buffer), 0, buffer.byteLength, 0);
  } finally {
    fs.closeSync(fd);
  }
  return filename;
}

export function readAudioFile(rel: string): Buffer {
  const filePath = resolveAudioPath(rel);
  if (!fs.existsSync(filePath)) {
    console.error('[audioStore] file not found:', filePath, '(rel:', rel, ')');
    throw new Error(`audio file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

export function removeAudioFile(rel: string): void {
  try {
    const filePath = resolveAudioPath(rel);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore missing file
  }
}
