import { ipcMain } from 'electron';
import type { Database } from 'better-sqlite3';

export function registerWritingHandlers(db: Database): void {
  ipcMain.handle('writing:get-all', () => {
    return db.prepare('SELECT * FROM writings WHERE deleted = 0 ORDER BY updated_at DESC').all();
  });

  ipcMain.handle('writing:get-by-id', (_event, id: number) => {
    return db.prepare('SELECT * FROM writings WHERE id = ? AND deleted = 0').get(id);
  });

  ipcMain.handle('writing:create', (_event, title: string) => {
    const result = db.prepare(
      'INSERT INTO writings (title, content, word_count) VALUES (?, ?, 0)'
    ).run(title, '');
    return result.lastInsertRowid as number;
  });

  ipcMain.handle('writing:update', (_event, id: number, data: { title?: string; content?: string; folder_id?: number | null }) => {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.title !== undefined) {
      fields.push('title = ?');
      values.push(data.title);
    }
    if (data.content !== undefined) {
      fields.push('content = ?');
      values.push(data.content);
      fields.push('word_count = ?');
      // content 为 Tiptap 输出的 HTML，统计纯文本字数
      const plainText = data.content.replace(/<[^>]+>/g, '').replace(/\s/g, '');
      values.push(plainText.length);
    }
    if (data.folder_id !== undefined) {
      fields.push('folder_id = ?');
      values.push(data.folder_id);
    }

    if (fields.length === 0) return false;

    fields.push("updated_at = datetime('now', 'localtime')");
    values.push(id);

    db.prepare(`UPDATE writings SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return true;
  });

  ipcMain.handle('writing:delete', (_event, id: number) => {
    db.prepare("UPDATE writings SET deleted = 1, updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);
    return true;
  });

  ipcMain.handle('writing:save-snapshot', (_event, writingId: number, content: string) => {
    const insertStmt = db.prepare(
      'INSERT INTO writing_snapshots (writing_id, content) VALUES (?, ?)'
    );
    const cleanupStmt = db.prepare(
      `DELETE FROM writing_snapshots
       WHERE writing_id = ?
         AND id NOT IN (
           SELECT id FROM writing_snapshots
           WHERE writing_id = ?
           ORDER BY snapshot_at DESC
           LIMIT 20
         )`
    );
    const tx = db.transaction(() => {
      insertStmt.run(writingId, content);
      cleanupStmt.run(writingId, writingId);
    });
    tx();
    return true;
  });
}
