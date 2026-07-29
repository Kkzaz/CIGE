import { ipcMain } from 'electron';
import type { Database } from 'better-sqlite3';
import { cleanupExcerptAudios } from './excerpt';
import { removeAudioFile } from '../audioStore';

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
    const excerptAudios = db.prepare(
      `SELECT ea.id, 'excerpt_audio' as type,
              COALESCE('音频动机 · ' || substr(e.content, 1, 24), '音频动机') as title,
              '时长 ' || ROUND(ea.duration, 1) || 's · 来自摘抄 #' || ea.excerpt_id as preview,
              ea.created_at as deleted_at,
              ea.audio_path as audio_path,
              ea.duration as audio_duration
       FROM excerpt_audios ea
       LEFT JOIN excerpts e ON e.id = ea.excerpt_id
       WHERE ea.deleted = 1
       ORDER BY ea.created_at DESC`
    ).all();
    return [...writings, ...excerpts, ...inspirations, ...excerptAudios];
  });

  ipcMain.handle('recycle:restore', (_event, type: string, id: number) => {
    if (type === 'excerpt_audio') {
      db.prepare('UPDATE excerpt_audios SET deleted = 0 WHERE id = ?').run(id);
      return true;
    }
    const table = type === 'writing' ? 'writings' : type === 'excerpt' ? 'excerpts' : 'inspirations';
    db.prepare(`UPDATE ${table} SET deleted = 0 WHERE id = ?`).run(id);
    if (type === 'excerpt') {
      // 恢复摘抄时一并恢复其音频
      db.prepare('UPDATE excerpt_audios SET deleted = 0 WHERE excerpt_id = ?').run(id);
    }
    return true;
  });

  ipcMain.handle('recycle:permanent-delete', (_event, type: string, id: number) => {
    if (type === 'excerpt_audio') {
      const row = db.prepare('SELECT audio_path FROM excerpt_audios WHERE id = ?').get(id) as { audio_path: string } | undefined;
      if (row?.audio_path) removeAudioFile(row.audio_path);
      db.prepare('DELETE FROM excerpt_audios WHERE id = ? AND deleted = 1').run(id);
      return true;
    }
    const table = type === 'writing' ? 'writings' : type === 'excerpt' ? 'excerpts' : 'inspirations';
    if (type === 'excerpt') cleanupExcerptAudios(db, id);
    db.prepare(`DELETE FROM ${table} WHERE id = ? AND deleted = 1`).run(id);
    return true;
  });
}
