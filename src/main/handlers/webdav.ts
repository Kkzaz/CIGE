import { ipcMain } from 'electron';
import type { Database } from 'better-sqlite3';
import { getAppSettings } from '../settings';
import { saveAudioFile } from '../audioStore';
import {
  testWebDAV,
  listItems,
  downloadItem,
  downloadAudio,
  getSyncState,
  saveSyncState,
  type RemoteItem,
} from '../services/webdavClient';

/** 从坚果云拉取新条目到本地摘抄库 */
export async function pullFromCloudManually(db: Database): Promise<{ added: number; message: string }> {
  const settings = getAppSettings();
  const config = settings.webdav;
  if (!config.enabled || !config.username || !config.password) {
    return { added: 0, message: 'WebDAV 未配置' };
  }

  try {
    // 1. 读取同步状态
    const state = await getSyncState(config);
    const pulledSet = new Set(state.pulledIds);

    // 2. 列出远程所有条目
    const remoteIds = await listItems(config);
    const newIds = remoteIds.filter(id => !pulledSet.has(id));

    if (newIds.length === 0) {
      return { added: 0, message: '已同步' };
    }

    // 3. 逐个下载并写入本地数据库
    let added = 0;
    for (const id of newIds) {
      const item = await downloadItem(config, id);
      if (!item) continue;

      // 创建摘抄
      const result = db.prepare(
        'INSERT INTO excerpts (content, source, tags) VALUES (?, ?, ?)'
      ).run(item.content || '', item.source || '', item.tags || '移动端');
      const excerptId = result.lastInsertRowid as number;

      // 如果有音频，下载并保存
      if (item.audioName && item.duration !== undefined) {
        const audioData = await downloadAudio(config, item.audioName);
        if (audioData) {
          const filename = saveAudioFile(excerptId, audioData.buffer.slice(0) as ArrayBuffer);
          db.prepare(
            'INSERT INTO excerpt_audios (excerpt_id, audio_path, duration, sort_order) VALUES (?, ?, ?, 0)'
          ).run(excerptId, filename, item.duration);
          db.prepare("UPDATE excerpts SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(excerptId);
        }
      }

      pulledSet.add(id);
      added++;
    }

    // 4. 更新同步状态
    await saveSyncState(config, {
      lastSyncedId: newIds[newIds.length - 1] || state.lastSyncedId,
      pulledIds: Array.from(pulledSet),
    });

    console.log(`[WebDAV] 已同步 ${added} 条新条目`);
    return { added, message: `已同步 ${added} 条` };
  } catch (err) {
    const message = '同步失败: ' + (err as Error).message;
    console.error('[WebDAV]', message);
    return { added: 0, message };
  }
}

export function registerWebDAVHandlers(db: Database): void {
  // 测试连接
  ipcMain.handle('webdav:test', async () => {
    const settings = getAppSettings();
    return testWebDAV(settings.webdav);
  });

  // 手动触发同步
  ipcMain.handle('webdav:sync', async () => {
    return pullFromCloudManually(db);
  });
}
