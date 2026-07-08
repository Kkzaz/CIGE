import { ipcMain } from 'electron';
import type { Database } from 'better-sqlite3';

export function registerFolderHandlers(db: Database): void {
  ipcMain.handle('folder:get-all', () => {
    return db.prepare('SELECT * FROM folders ORDER BY parent_id NULLS FIRST, name').all();
  });

  ipcMain.handle('folder:create', (_event, name: string, parentId: number | null = null) => {
    const result = db.prepare('INSERT INTO folders (name, parent_id) VALUES (?, ?)').run(name, parentId);
    return result.lastInsertRowid as number;
  });

  ipcMain.handle('folder:rename', (_event, id: number, name: string) => {
    db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, id);
    return true;
  });

  ipcMain.handle('folder:move', (_event, id: number, parentId: number | null) => {
    // Prevent moving a folder into itself or its descendants (circular reference)
    if (parentId !== null) {
      let currentId: number | null = parentId;
      while (currentId !== null) {
        if (currentId === id) {
          throw new Error('Cannot move a folder into itself or its descendants');
        }
        const folder = db.prepare('SELECT parent_id FROM folders WHERE id = ?').get(currentId) as { parent_id: number | null } | undefined;
        if (!folder) break;
        currentId = folder.parent_id;
      }
    }
    db.prepare('UPDATE folders SET parent_id = ? WHERE id = ?').run(parentId, id);
    return true;
  });

  ipcMain.handle('folder:delete', (_event, id: number) => {
    db.prepare('UPDATE writings SET folder_id = NULL WHERE folder_id = ?').run(id);
    db.prepare('UPDATE folders SET parent_id = NULL WHERE parent_id = ?').run(id);
    db.prepare('DELETE FROM folders WHERE id = ?').run(id);
    return true;
  });
}
