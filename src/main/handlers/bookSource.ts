import { ipcMain, dialog, BrowserWindow } from 'electron';
import type { Database } from 'better-sqlite3';
import * as bookSourceEngine from '../bookSourceEngine';
import {
  importBookWithLazyLoading,
  pauseImport,
  resumeImport,
  cancelImport,
  getImportProgress,
  getAllImportProgress,
  loadPersistedImportTasks,
  setImportProgressCallback,
} from '../services/bookImportService';

export function registerBookSourceHandlers(db: Database): void {
  // 将导入进度广播给所有渲染窗口
  setImportProgressCallback((progress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('book-import:progress', progress);
      }
    }
  });

  ipcMain.handle('book-source:get-all', () => {
    return db.prepare('SELECT * FROM book_sources WHERE deleted = 0 ORDER BY enabled DESC, updated_at DESC').all();
  });

  ipcMain.handle('book-source:create', (_event, config: bookSourceEngine.BookSourceConfig) => {
    const insert = db.prepare(
      'INSERT INTO book_sources (name, url, group_name, config) VALUES (?, ?, ?, ?)'
    );
    const inserted = insert.run(
      config.bookSourceName,
      config.bookSourceUrl,
      config.bookSourceGroup || '',
      JSON.stringify(config)
    );
    return { id: inserted.lastInsertRowid, ...config };
  });

  ipcMain.handle('book-source:import', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入书源',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return [];

    const imported: number[] = [];
    for (const filePath of result.filePaths) {
      const raw = require('fs').readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const sources = Array.isArray(parsed) ? parsed : [parsed];
      for (const source of sources) {
        const cfg = bookSourceEngine.parseBookSource(JSON.stringify(source));
        if (!cfg || !cfg.bookSourceUrl) continue;
        const insert = db.prepare('INSERT INTO book_sources (name, url, group_name, config) VALUES (?, ?, ?, ?)');
        const result = insert.run(cfg.bookSourceName, cfg.bookSourceUrl, cfg.bookSourceGroup || '', JSON.stringify(cfg));
        imported.push(Number(result.lastInsertRowid));
      }
    }
    return imported;
  });

  ipcMain.handle('book-source:toggle', (_event, id: number) => {
    const current = db.prepare('SELECT enabled FROM book_sources WHERE id = ?').get(id) as { enabled: number } | undefined;
    if (!current) return false;
    const next = current.enabled ? 0 : 1;
    db.prepare("UPDATE book_sources SET enabled = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(next, id);
    return next === 1;
  });

  ipcMain.handle('book-source:enable-all', () => {
    const result = db.prepare("UPDATE book_sources SET enabled = 1, updated_at = datetime('now', 'localtime') WHERE deleted = 0").run();
    return result.changes;
  });

  ipcMain.handle('book-source:swap-enabled', () => {
    db.prepare("UPDATE book_sources SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END, updated_at = datetime('now', 'localtime') WHERE deleted = 0").run();
    const counts = db.prepare('SELECT enabled, COUNT(*) as count FROM book_sources WHERE deleted = 0 GROUP BY enabled').all() as { enabled: number; count: number }[];
    return counts.reduce((acc, row) => {
      acc[row.enabled === 1 ? 'enabled' : 'disabled'] = row.count;
      return acc;
    }, {} as { enabled: number; disabled: number });
  });

  ipcMain.handle('book-source:delete', (_event, id: number) => {
    db.prepare("UPDATE book_sources SET deleted = 1, updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);
    return true;
  });

  ipcMain.handle('book-source:search', async (_event, sourceId: number, keyword: string) => {
    const row = db.prepare('SELECT * FROM book_sources WHERE id = ? AND deleted = 0').get(sourceId) as { config: string } | undefined;
    if (!row) throw new Error('Book source not found');
    const config = JSON.parse(row.config) as bookSourceEngine.BookSourceConfig;
    return bookSourceEngine.searchBySource(config, keyword);
  });

  ipcMain.handle('book-source:search-all', async (_event, keyword: string) => {
    const rows = db.prepare('SELECT * FROM book_sources WHERE deleted = 0 AND enabled = 1').all() as { id: number; config: string }[];
    const configs = rows.map((r) => ({ ...JSON.parse(r.config) as bookSourceEngine.BookSourceConfig, id: r.id }));
    const results = await bookSourceEngine.searchAllSources(configs, keyword);
    return results.map((r) => ({ ...r, sourceId: configs.find((c) => c.bookSourceName === r.sourceName)?.id }));
  });

  ipcMain.handle('book-source:explore', async (_event, sourceId: number) => {
    const row = db.prepare('SELECT * FROM book_sources WHERE id = ? AND deleted = 0 AND enabled = 1').get(sourceId) as { config: string } | undefined;
    if (!row) throw new Error('Book source not found');
    const config = JSON.parse(row.config) as bookSourceEngine.BookSourceConfig;
    return bookSourceEngine.exploreBySource(config);
  });

  ipcMain.handle('book-source:explore-categories', async (_event, sourceId: number) => {
    const row = db.prepare('SELECT * FROM book_sources WHERE id = ? AND deleted = 0 AND enabled = 1').get(sourceId) as { config: string } | undefined;
    if (!row) throw new Error('Book source not found');
    const config = JSON.parse(row.config) as bookSourceEngine.BookSourceConfig;
    return bookSourceEngine.getExploreCategories(config);
  });

  ipcMain.handle('book-source:explore-category-books', async (_event, sourceId: number, categoryUrl: string, page?: number, pageSize?: number) => {
    const row = db.prepare('SELECT * FROM book_sources WHERE id = ? AND deleted = 0 AND enabled = 1').get(sourceId) as { config: string } | undefined;
    if (!row) throw new Error('Book source not found');
    const config = JSON.parse(row.config) as bookSourceEngine.BookSourceConfig;
    return bookSourceEngine.getCategoryBooks(config, categoryUrl, page ?? 1, pageSize ?? 30);
  });

  ipcMain.handle('book-source:detail', async (_event, sourceId: number, bookUrl: string) => {
    const row = db.prepare('SELECT * FROM book_sources WHERE id = ? AND deleted = 0').get(sourceId) as { config: string } | undefined;
    if (!row) throw new Error('Book source not found');
    const config = JSON.parse(row.config) as bookSourceEngine.BookSourceConfig;
    return bookSourceEngine.getBookDetail(config, bookUrl);
  });

  ipcMain.handle('book-source:chapters', async (_event, sourceId: number, tocUrl: string) => {
    const row = db.prepare('SELECT * FROM book_sources WHERE id = ? AND deleted = 0').get(sourceId) as { config: string } | undefined;
    if (!row) throw new Error('Book source not found');
    const config = JSON.parse(row.config) as bookSourceEngine.BookSourceConfig;
    return bookSourceEngine.getChapterList(config, tocUrl);
  });

  ipcMain.handle('book-source:content', async (_event, sourceId: number, chapterUrl: string) => {
    const row = db.prepare('SELECT * FROM book_sources WHERE id = ? AND deleted = 0').get(sourceId) as { config: string } | undefined;
    if (!row) throw new Error('Book source not found');
    const config = JSON.parse(row.config) as bookSourceEngine.BookSourceConfig;
    return bookSourceEngine.getChapterContent(config, chapterUrl);
  });

  ipcMain.handle('book-source:import-book', async (_event, sourceId: number, bookUrl: string, chapterLimit = 9999) => {
    return importBookWithLazyLoading(db, sourceId, bookUrl, chapterLimit);
  });

  ipcMain.handle('book-source:pause-import', (_event, bookId: number) => {
    return pauseImport(bookId);
  });

  ipcMain.handle('book-source:resume-import', (_event, bookId: number) => {
    return resumeImport(bookId, db);
  });

  ipcMain.handle('book-source:cancel-import', (_event, bookId: number) => {
    return cancelImport(bookId);
  });

  ipcMain.handle('book-source:get-import-progress', (_event, bookId: number) => {
    return getImportProgress(bookId);
  });

  ipcMain.handle('book-source:get-all-import-progress', () => {
    return getAllImportProgress();
  });

  // 启动时恢复未完成的导入任务
  loadPersistedImportTasks(db);
}
