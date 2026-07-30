import { net } from 'electron';
import type { WebDAVConfig } from '../settings';

// 坚果云 WebDAV 根目录下的应用目录
const REMOTE_DIR = 'cige-mobile';
// 同步状态文件名（记录最后同步的条目 ID）
const SYNC_STATE_FILE = 'sync-state.json';

interface RemoteItem {
  id: string;
  type: 'quote' | 'motivation';
  content: string;
  source: string;
  tags: string;
  audioName?: string;   // 音频文件名（如果有）
  duration?: number;
  createdAt: number;
}

interface SyncState {
  lastSyncedId: string | null;
  pulledIds: string[];  // 已拉取到桌面端的条目 ID
}

function authHeader(config: WebDAVConfig): string {
  return 'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64');
}

function buildUrl(config: WebDAVConfig, path: string): string {
  const base = config.url.endsWith('/') ? config.url.slice(0, -1) : config.url;
  return `${base}/${path}`;
}

/** 发起 HTTP 请求 */
function request(
  method: string,
  url: string,
  config: WebDAVConfig,
  body?: Buffer | string,
  headers?: Record<string, string>
): Promise<{ status: number; data: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = net.request({
      method,
      url,
    });
    req.setHeader('Authorization', authHeader(config));
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        req.setHeader(k, v);
      }
    }
    req.on('response', (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        resolve({ status: response.statusCode, data: Buffer.concat(chunks) });
      });
    });
    req.on('error', (err) => reject(err));
    if (body !== undefined) {
      req.write(typeof body === 'string' ? Buffer.from(body, 'utf8') : body);
    }
    req.end();
  });
}

/** 测试 WebDAV 连接（PROPFIND 根目录） */
export async function testWebDAV(config: WebDAVConfig): Promise<{ ok: boolean; message: string }> {
  if (!config.username || !config.password) {
    return { ok: false, message: '请填写账号和密码' };
  }
  try {
    const { status } = await request('PROPFIND', config.url, config, undefined, {
      Depth: '0',
      'Content-Type': 'application/xml',
    });
    if (status === 207 || status === 200) {
      return { ok: true, message: '连接成功' };
    }
    return { ok: false, message: `连接失败: HTTP ${status}` };
  } catch (err) {
    return { ok: false, message: '连接失败: ' + (err as Error).message };
  }
}

/** 确保远程目录存在（MKCOL，已存在则忽略） */
export async function ensureRemoteDir(config: WebDAVConfig): Promise<void> {
  try {
    await request('MKCOL', buildUrl(config, REMOTE_DIR), config);
  } catch {
    // 忽略错误（目录已存在会返回 405）
  }
}

/** 上传条目（文字灵感或音频动机的元数据） */
export async function uploadItem(config: WebDAVConfig, item: RemoteItem): Promise<void> {
  await ensureRemoteDir(config);
  const filePath = `${REMOTE_DIR}/${item.id}.json`;
  const json = JSON.stringify(item);
  await request('PUT', buildUrl(config, filePath), config, json, {
    'Content-Type': 'application/json; charset=utf-8',
  });
}

/** 上传音频文件 */
export async function uploadAudio(config: WebDAVConfig, audioName: string, data: Buffer): Promise<void> {
  await ensureRemoteDir(config);
  const filePath = `${REMOTE_DIR}/${audioName}`;
  await request('PUT', buildUrl(config, filePath), config, data, {
    'Content-Type': 'application/octet-stream',
  });
}

/** 列出远程目录中的所有条目文件 */
export async function listItems(config: WebDAVConfig): Promise<string[]> {
  try {
    const { status, data } = await request('PROPFIND', buildUrl(config, REMOTE_DIR), config, undefined, {
      Depth: '1',
      'Content-Type': 'application/xml',
    });
    if (status !== 207) return [];

    const xml = data.toString('utf8');
    // 解析 <d:href> 提取文件名
    const hrefs: string[] = [];
    const regex = /<(?:d:|D:)?href>([^<]+)<\/(?:d:|D:)?href>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      hrefs.push(match[1]);
    }
    // 过滤出 .json 文件（条目元数据），排除目录本身和其他文件
    return hrefs
      .map(h => decodeURIComponent(h))
      .filter(h => h.endsWith('.json'))
      .map(h => h.split('/').pop()!.replace('.json', ''));
  } catch {
    return [];
  }
}

/** 下载条目元数据 */
export async function downloadItem(config: WebDAVConfig, itemId: string): Promise<RemoteItem | null> {
  try {
    const { status, data } = await request('GET', buildUrl(config, `${REMOTE_DIR}/${itemId}.json`), config);
    if (status !== 200) return null;
    return JSON.parse(data.toString('utf8')) as RemoteItem;
  } catch {
    return null;
  }
}

/** 下载音频文件 */
export async function downloadAudio(config: WebDAVConfig, audioName: string): Promise<Buffer | null> {
  try {
    const { status, data } = await request('GET', buildUrl(config, `${REMOTE_DIR}/${audioName}`), config);
    if (status !== 200) return null;
    return data;
  } catch {
    return null;
  }
}

/** 删除远程条目 */
export async function deleteItem(config: WebDAVConfig, itemId: string): Promise<void> {
  try {
    await request('DELETE', buildUrl(config, `${REMOTE_DIR}/${itemId}.json`), config);
  } catch {
    // 忽略删除错误
  }
}

/** 读取同步状态 */
export async function getSyncState(config: WebDAVConfig): Promise<SyncState> {
  try {
    const { status, data } = await request('GET', buildUrl(config, `${REMOTE_DIR}/${SYNC_STATE_FILE}`), config);
    if (status === 200) {
      return JSON.parse(data.toString('utf8')) as SyncState;
    }
  } catch {
    // 文件不存在
  }
  return { lastSyncedId: null, pulledIds: [] };
}

/** 写入同步状态 */
export async function saveSyncState(config: WebDAVConfig, state: SyncState): Promise<void> {
  await ensureRemoteDir(config);
  const json = JSON.stringify(state);
  await request('PUT', buildUrl(config, `${REMOTE_DIR}/${SYNC_STATE_FILE}`), config, json, {
    'Content-Type': 'application/json; charset=utf-8',
  });
}

export type { RemoteItem, SyncState };
