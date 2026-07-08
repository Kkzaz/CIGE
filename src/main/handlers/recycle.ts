import { ipcMain } from 'electron';
import type { Database } from 'better-sqlite3';

export function registerRecycleHandlers(db: Database): void {
  ipcMain.handle('recycle:get-all', () => {
    const writings = db.prepare(
      "SELECT id, 'writing' as type, title, substr(content, 1, 80) as preview, updated_at as deleted_at FROM writings WHERE deleted = 1 ORDER BY updated_at DESC"
    ).all();
    const excerpts = db.prepare(
      "SELECT id, 'excerpt' as type, substr(content, 1, 60) as title, substr(content, 1, 80) as preview, updated_at as deleted_at FROM excerpts WHERE deleted = 1 ORDER BY updated_at DESC"
    ).all();
    const inspirations = db.prepare(
      "SELECT id, 'inspiration' as type, substr(content, 1, 60) as title, substr(content, 1, 80) as preview, created_at as deleted_at FROM inspirations WHERE deleted = 1 ORDER BY created_at DESC"
    ).all();
    return [...writings, ...excerpts, ...inspirations];
  });

  ipcMain.handle('recycle:restore', (_event, type: string, id: number) => {
    const table = type === 'writing' ? 'writings' : type === 'excerpt' ? 'excerpts' : 'inspirations';
    db.prepare(`UPDATE ${table} SET deleted = 0 WHERE id = ?`).run(id);
    return true;
  });

  ipcMain.handle('recycle:permanent-delete', (_event, type: string, id: number) => {
    const table = type === 'writing' ? 'writings' : type === 'excerpt' ? 'excerpts' : 'inspirations';
    db.prepare(`DELETE FROM ${table} WHERE id = ? AND deleted = 1`).run(id);
    return true;
  });
}
