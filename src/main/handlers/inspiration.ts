import { ipcMain } from 'electron';
import type { Database } from 'better-sqlite3';
import { syncMoreHotTrendsToInspirations, syncMoreQuotesToInspirations } from '../services/syncService';
import { LOCAL_SERVICE_PORT, fetchJsonFromLocalService } from '../services/rhymeServer';

export function registerInspirationHandlers(db: Database): void {
  ipcMain.handle('inspiration:get-all', () => {
    return db.prepare('SELECT * FROM inspirations WHERE deleted = 0 ORDER BY created_at DESC').all();
  });

  ipcMain.handle('inspiration:search-music-lyrics', async (_event, query: string, platform: string = 'netease') => {
    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `http://127.0.0.1:${LOCAL_SERVICE_PORT}/music/search?query=${encodedQuery}&platform=${platform}`;
      return (await fetchJsonFromLocalService(url)) ?? { success: false, error: '服务未响应' };
    } catch (error) {
      console.error('[Inspiration] 歌词查重失败:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('inspiration:get-by-tag', (_event, tagPrefix: string, limit: number, offset: number) => {
    return db.prepare(
      'SELECT * FROM inspirations WHERE deleted = 0 AND tags LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(`%${tagPrefix}%`, limit, offset);
  });

  ipcMain.handle('inspiration:create', (_event, data: { content: string; tags: string }) => {
    const result = db.prepare(
      'INSERT INTO inspirations (content, tags) VALUES (?, ?)'
    ).run(data.content, data.tags);
    return result.lastInsertRowid as number;
  });

  ipcMain.handle('inspiration:delete', (_event, id: number) => {
    try {
      console.log(`Attempting to delete inspiration with id: ${id}`);
      const result = db.prepare('UPDATE inspirations SET deleted = 1 WHERE id = ?').run(id);
      console.log(`Delete result: ${result.changes} rows affected`);
      return result.changes > 0;
    } catch (error) {
      console.error('Failed to delete inspiration:', error);
      throw error;
    }
  });

  ipcMain.handle('hot-trends:fetch-more', async () => {
    try {
      return await syncMoreHotTrendsToInspirations(db);
    } catch (error) {
      console.error('Failed to fetch more hot trends:', error);
      return 0;
    }
  });

  ipcMain.handle('quotes:fetch-more', async () => {
    try {
      return await syncMoreQuotesToInspirations(db);
    } catch (error) {
      console.error('Failed to fetch more quotes:', error);
      return 0;
    }
  });
}
