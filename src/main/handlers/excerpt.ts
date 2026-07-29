import { ipcMain } from 'electron';
import type { Database } from 'better-sqlite3';
import { saveAudioFile, readAudioFile, removeAudioFile } from '../audioStore';
import type { ExcerptAudio } from '../../shared/types';

export function registerExcerptHandlers(db: Database): void {
  ipcMain.handle('excerpt:get-all', () => {
    return db.prepare('SELECT * FROM excerpts WHERE deleted = 0 ORDER BY created_at DESC').all();
  });

  // 批量查询摘抄及其音频，解决 N+1 问题
  ipcMain.handle('excerpt:get-all-with-audios', () => {
    const excerpts = db.prepare('SELECT * FROM excerpts WHERE deleted = 0 ORDER BY created_at DESC').all();
    if (excerpts.length === 0) return { excerpts, audios: {} };
    const audios = db.prepare(
      'SELECT * FROM excerpt_audios WHERE deleted = 0 ORDER BY sort_order ASC'
    ).all() as ExcerptAudio[];
    // 按 excerpt_id 分组
    const audiosMap: Record<number, ExcerptAudio[]> = {};
    for (const a of audios) {
      if (!audiosMap[a.excerpt_id]) audiosMap[a.excerpt_id] = [];
      audiosMap[a.excerpt_id].push(a);
    }
    return { excerpts, audios: audiosMap };
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
    db.prepare("UPDATE excerpt_audios SET deleted = 1 WHERE excerpt_id = ?").run(id);
    return true;
  });

  ipcMain.handle('excerpt:save-audio', (_event, excerptId: number, buffer: ArrayBuffer, duration: number) => {
    try {
      const filename = saveAudioFile(excerptId, buffer);
      const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
      const sortOrderRow = db.prepare(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM excerpt_audios WHERE excerpt_id = ? AND deleted = 0'
      ).get(excerptId) as { next: number } | undefined;
      const sortOrder = sortOrderRow?.next ?? 0;
      const result = db.prepare(
        'INSERT INTO excerpt_audios (excerpt_id, audio_path, duration, sort_order) VALUES (?, ?, ?, ?)'
      ).run(excerptId, filename, safeDuration, sortOrder);
      db.prepare("UPDATE excerpts SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(excerptId);
      const row = db.prepare('SELECT * FROM excerpt_audios WHERE id = ?').get(result.lastInsertRowid) as ExcerptAudio;
      return row;
    } catch (err) {
      console.error('[excerpt:save-audio] failed:', err);
      throw err;
    }
  });

  ipcMain.handle('excerpt:get-audios', (_event, excerptId: number) => {
    return db.prepare('SELECT * FROM excerpt_audios WHERE excerpt_id = ? AND deleted = 0 ORDER BY sort_order ASC').all(excerptId);
  });

  ipcMain.handle('excerpt:get-audio', (_event, rel: string) => {
    try {
      if (!rel || typeof rel !== 'string') return null;
      const buf = readAudioFile(rel);
      // 创建独立的 ArrayBuffer，避免 Node.js Buffer 池的 IPC 传输问题
      const ab = new ArrayBuffer(buf.byteLength);
      const view = new Uint8Array(ab);
      view.set(buf);
      return ab;
    } catch (e) {
      console.error('[excerpt:get-audio] failed for rel', rel, ':', e);
      return null;
    }
  });

  ipcMain.handle('excerpt:delete-audio', (_event, audioId: number) => {
    const row = db.prepare('SELECT excerpt_id FROM excerpt_audios WHERE id = ?').get(audioId) as { excerpt_id: number } | undefined;
    if (!row) return false;
    db.prepare("UPDATE excerpt_audios SET deleted = 1 WHERE id = ?").run(audioId);
    db.prepare("UPDATE excerpts SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(row.excerpt_id);
    return true;
  });
}

export function cleanupExcerptAudios(db: Database, excerptId: number): void {
  const rows = db.prepare('SELECT audio_path FROM excerpt_audios WHERE excerpt_id = ?').all(excerptId) as { audio_path: string }[];
  for (const r of rows) removeAudioFile(r.audio_path);
}

