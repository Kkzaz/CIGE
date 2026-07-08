import { ipcMain } from 'electron';
import type { Database } from 'better-sqlite3';

export function registerExcerptHandlers(db: Database): void {
  ipcMain.handle('excerpt:get-all', () => {
    return db.prepare('SELECT * FROM excerpts WHERE deleted = 0 ORDER BY created_at DESC').all();
  });

  ipcMain.handle('excerpt:search', (_event, query: string, tag?: string) => {
    let sql = 'SELECT * FROM excerpts WHERE (content LIKE ? OR source LIKE ? OR tags LIKE ?)';
    const params: unknown[] = [`%${query}%`, `%${query}%`, `%${query}%`];

    if (tag) {
      sql += ' AND tags LIKE ?';
      params.push(`%${tag}%`);
    }

    sql += ' AND deleted = 0 ORDER BY created_at DESC LIMIT 100';
    return db.prepare(sql).all(...params);
  });

  ipcMain.handle('excerpt:create', (_event, data: { content: string; source: string; tags: string }) => {
    const result = db.prepare(
      'INSERT INTO excerpts (content, source, tags) VALUES (?, ?, ?)'
    ).run(data.content, data.source, data.tags);
    return result.lastInsertRowid as number;
  });

  ipcMain.handle('excerpt:update', (_event, id: number, data: { content?: string; source?: string; tags?: string }) => {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.content !== undefined) { fields.push('content = ?'); values.push(data.content); }
    if (data.source !== undefined) { fields.push('source = ?'); values.push(data.source); }
    if (data.tags !== undefined) { fields.push('tags = ?'); values.push(data.tags); }

    if (fields.length === 0) return false;

    fields.push("updated_at = datetime('now', 'localtime')");
    values.push(id);

    db.prepare(`UPDATE excerpts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return true;
  });

  ipcMain.handle('excerpt:delete', (_event, id: number) => {
    db.prepare("UPDATE excerpts SET deleted = 1, updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);
    return true;
  });
}
