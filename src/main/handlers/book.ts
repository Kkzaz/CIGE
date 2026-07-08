import { ipcMain, dialog } from 'electron';
import http from 'http';
import https from 'https';
import type { Database } from 'better-sqlite3';

const COVER_PALETTE = ['#C4A77D', '#A89F91', '#8B7355', '#B8A99A', '#9E8B7D', '#7D8B8B', '#9A8B7A', '#8B9A7A'];

interface BookInput {
  title: string;
  author?: string;
  content: string;
  description?: string;
  cover?: string;
  category?: string;
  tags?: string;
}

export function registerBookHandlers(db: Database): void {
  ipcMain.handle('book:get-all', (_event, options?: { category?: string; favorite?: boolean; query?: string; sourceTag?: string }) => {
    let sql = 'SELECT * FROM books WHERE deleted = 0';
    const params: unknown[] = [];
    if (options?.category) {
      sql += ' AND category = ?';
      params.push(options.category);
    }
    if (options?.favorite) {
      sql += ' AND is_favorite = 1';
    }
    if (options?.query?.trim()) {
      sql += ' AND (title LIKE ? OR author LIKE ? OR tags LIKE ? OR description LIKE ?)';
      const q = `%${options.query.trim()}%`;
      params.push(q, q, q, q);
    }
    if (options?.sourceTag) {
      sql += ' AND tags LIKE ?';
      params.push(`%${options.sourceTag}%`);
    }
    sql += ' ORDER BY is_favorite DESC, updated_at DESC';
    const rows = db.prepare(sql).all(...params);
    console.log('[book:get-all] options=', options, 'count=', rows.length);
    return rows;
  });

  ipcMain.handle('book:get-by-id', (_event, id: number) => {
    return db.prepare('SELECT * FROM books WHERE id = ? AND deleted = 0').get(id);
  });

  ipcMain.handle('book:get-chapters', (_event, bookId: number) => {
    return db.prepare('SELECT id, title, start_paragraph, end_paragraph FROM book_chapters WHERE book_id = ? ORDER BY sort_order').all(bookId);
  });

  ipcMain.handle('book:toggle-favorite', (_event, id: number) => {
    const current = db.prepare('SELECT is_favorite FROM books WHERE id = ?').get(id) as { is_favorite: number } | undefined;
    if (!current) return false;
    const next = current.is_favorite ? 0 : 1;
    db.prepare("UPDATE books SET is_favorite = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(next, id);
    return next === 1;
  });

  ipcMain.handle('book:create', (_event, data: { title: string; author: string; content: string; category?: string; tags?: string; cover?: string; description?: string }) => {
    const result = db.prepare(
      'INSERT INTO books (title, author, description, content, cover, category, tags) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      data.title,
      data.author,
      data.description || '',
      data.content,
      data.cover || '',
      data.category || '',
      data.tags || ''
    );
    return result.lastInsertRowid as number;
  });

  ipcMain.handle('book:delete', (_event, id: number) => {
    db.prepare("UPDATE books SET deleted = 1, updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);
    return true;
  });

  ipcMain.handle('book:batch-delete', (_event, ids: number[]) => {
    if (!ids || ids.length === 0) return false;
    const stmt = db.prepare("UPDATE books SET deleted = 1, updated_at = datetime('now', 'localtime') WHERE id = ?");
    const deleteMany = db.transaction((rows: number[]) => {
      for (const id of rows) stmt.run(id);
    });
    deleteMany(ids);
    return true;
  });

  ipcMain.handle('book:update', (_event, id: number, data: { title?: string; author?: string; content?: string; category?: string; tags?: string; cover?: string; description?: string }) => {
    const current = db.prepare('SELECT * FROM books WHERE id = ? AND deleted = 0').get(id) as Record<string, any> | undefined;
    if (!current) throw new Error('Book not found');

    const next = {
      title: data.title ?? current.title,
      author: data.author ?? current.author,
      description: data.description ?? current.description,
      content: data.content ?? current.content,
      cover: data.cover ?? current.cover,
      category: data.category ?? current.category,
      tags: data.tags ?? current.tags,
    };

    db.prepare(
      'UPDATE books SET title = ?, author = ?, description = ?, content = ?, cover = ?, category = ?, tags = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?'
    ).run(next.title, next.author, next.description, next.content, next.cover, next.category, next.tags, id);
    return { id, ...next, is_favorite: current.is_favorite };
  });

  ipcMain.handle('book:get-reading-progress', (_event, bookId: number) => {
    return db.prepare('SELECT book_id, chapter_id, scroll_top, updated_at FROM book_reading_progress WHERE book_id = ?').get(bookId);
  });

  ipcMain.handle('book:save-reading-progress', (_event, bookId: number, data: { chapter_id: number; scroll_top: number }) => {
    db.prepare(
      `INSERT INTO book_reading_progress (book_id, chapter_id, scroll_top, updated_at)
       VALUES (?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT(book_id) DO UPDATE SET
         chapter_id = excluded.chapter_id,
         scroll_top = excluded.scroll_top,
         updated_at = excluded.updated_at`
    ).run(bookId, data.chapter_id, data.scroll_top);
    // 同步更新 books.updated_at，使书架能按最近阅读排序
    db.prepare("UPDATE books SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(bookId);
    return true;
  });

  ipcMain.handle('book:import-file', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入书源文件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '书源文件', extensions: ['txt', 'md', 'json'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return [];

    const imported: ReturnType<typeof insertImportedBook>[] = [];
    let lastError: Error | null = null;
    for (const filePath of result.filePaths) {
      try {
        imported.push(...importFromFile(db, filePath, '导入书源'));
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    if (imported.length === 0) {
      throw lastError || new Error('未导入任何书籍');
    }
    return imported;
  });

  ipcMain.handle('book:import-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入书源文件夹',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return [];

    const folderPath = result.filePaths[0];
    const entries = require('fs').readdirSync(folderPath, { withFileTypes: true });
    const imported: ReturnType<typeof insertImportedBook>[] = [];
    let lastError: Error | null = null;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = require('path').extname(entry.name).toLowerCase();
      if (!['.txt', '.md', '.json'].includes(ext)) continue;
      const filePath = require('path').join(folderPath, entry.name);
      try {
        imported.push(...importFromFile(db, filePath, '导入书源'));
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    if (imported.length === 0) {
      throw lastError || new Error('文件夹中未找到可导入的书籍');
    }
    return imported;
  });

  ipcMain.handle('book:import-url', async (_event, url: string) => {
    const text = await new Promise<string>((resolve, reject) => {
      const client = url.startsWith('https:') ? https : http;
      const req = client.get(url, { timeout: 15000 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          client.get(res.headers.location, { timeout: 15000 }, (res2) => {
            let data = '';
            res2.setEncoding('utf-8');
            res2.on('data', (chunk) => (data += chunk));
            res2.on('end', () => resolve(data));
            res2.on('error', reject);
          }).on('error', reject);
          return;
        }
        let data = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Request timeout')));
    });

    if (!text.trim()) throw new Error('Empty response');
    // Strip HTML tags for basic web page import
    const stripped = text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const title = url.split('/').pop() || '网络书源';
    return insertImportedBook(db, { title, author: '', content: stripped }, '网络书源');
  });

  ipcMain.handle('book:import-clipboard', async () => {
    // The clipboard read is handled by renderer; this handler receives the text
    throw new Error('Use book:import-manual or read clipboard in renderer');
  });

  ipcMain.handle('book:import-manual', (_event, data: { title: string; author: string; content: string; category?: string; tags?: string }) => {
    if (!data.title.trim() || !data.content.trim()) throw new Error('Title and content are required');
    const cover = COVER_PALETTE[Math.floor(Math.random() * COVER_PALETTE.length)];
    const insert = db.prepare(
      'INSERT INTO books (title, author, description, content, cover, category, tags) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const inserted = insert.run(
      data.title.trim(),
      data.author.trim(),
      '',
      data.content.trim(),
      cover,
      data.category?.trim() || '导入',
      data.tags?.trim() || '导入书源'
    );
    return {
      id: inserted.lastInsertRowid,
      title: data.title.trim(),
      author: data.author.trim(),
      content: data.content.trim(),
      cover,
      category: data.category?.trim() || '导入',
      tags: data.tags?.trim() || '导入书源',
      is_favorite: 0,
    };
  });
}

function parseBookText(raw: string, fallbackTitle: string): { title: string; author: string; content: string } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let title = fallbackTitle;
  let author = '';
  let content = raw;

  if (lines.length >= 3) {
    title = lines[0].replace(/^[#《\s]+|[》\s]+$/g, '');
    const possibleAuthor = lines[1];
    if (possibleAuthor.length < 30 && !possibleAuthor.includes('，') && !possibleAuthor.includes('。')) {
      author = possibleAuthor.replace(/^作者[：:]?\s*/, '');
      content = lines.slice(2).join('\n\n');
    }
  }
  return { title, author, content };
}

export function parseChapters(content: string): { title: string; startParagraph: number; endParagraph: number }[] {
  const paragraphs = content.split(/\n+/);
  const chapters: { title: string; startParagraph: number; endParagraph: number }[] = [];
  const chapterPatterns = [
    /^(第[零一二两三四五六七八九十百千万\d]+[章节回卷篇幕部集])([、\s：:])?(.*)$/,
    /^([\d]+)([、\s])(.*)$/,
    /^(Chapter\s*\d+)([、\s：:])(.*)$/i,
    /^(\d+\.\d+)([、\s])(.*)$/,
  ];

  let currentChapterStart = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    if (!para || para.length > 100) continue;

    let matched = false;
    for (const pattern of chapterPatterns) {
      const match = para.match(pattern);
      if (match) {
        if (currentChapterStart < i) {
          chapters.push({
            title: chapters.length === 0 ? '前言' : paragraphs[currentChapterStart].trim().slice(0, 50),
            startParagraph: currentChapterStart,
            endParagraph: i - 1,
          });
        }
        currentChapterStart = i;
        matched = true;
        break;
      }
    }

    if (!matched && para.length <= 30 && /^[一-龥]+$/.test(para) && i > 0) {
      if (currentChapterStart < i) {
        chapters.push({
          title: paragraphs[currentChapterStart].trim().slice(0, 50),
          startParagraph: currentChapterStart,
          endParagraph: i - 1,
        });
      }
      currentChapterStart = i;
    }
  }

  if (currentChapterStart < paragraphs.length) {
    chapters.push({
      title: paragraphs[currentChapterStart].trim().slice(0, 50),
      startParagraph: currentChapterStart,
      endParagraph: paragraphs.length - 1,
    });
  }

  if (chapters.length === 0 && paragraphs.length > 0) {
    const chunkSize = Math.max(1, Math.floor(paragraphs.length / 10));
    for (let i = 0; i < paragraphs.length; i += chunkSize) {
      const end = Math.min(i + chunkSize - 1, paragraphs.length - 1);
      chapters.push({
        title: `第${Math.floor(i / chunkSize) + 1}部分`,
        startParagraph: i,
        endParagraph: end,
      });
    }
  }

  return chapters;
}

function insertImportedBook(db: Database, parsed: BookInput, sourceLabel: string) {
  const cover = parsed.cover || COVER_PALETTE[Math.floor(Math.random() * COVER_PALETTE.length)];
  const insert = db.prepare(
    'INSERT INTO books (title, author, description, content, cover, category, tags) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const inserted = insert.run(
    parsed.title,
    parsed.author || '',
    parsed.description || '',
    parsed.content,
    cover,
    parsed.category || '导入',
    parsed.tags || sourceLabel
  );

  const bookId = inserted.lastInsertRowid;
  const chapters = parseChapters(parsed.content);
  if (chapters.length > 1) {
    const insertChapter = db.prepare(
      'INSERT INTO book_chapters (book_id, title, start_paragraph, end_paragraph, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    chapters.forEach((chapter, index) => {
      insertChapter.run(bookId, chapter.title, chapter.startParagraph, chapter.endParagraph, index);
    });
  }

  return {
    id: bookId,
    title: parsed.title,
    author: parsed.author || '',
    description: parsed.description || '',
    content: parsed.content,
    cover,
    category: parsed.category || '导入',
    tags: parsed.tags || sourceLabel,
    is_favorite: 0,
  };
}

function pickString(obj: any, keys: string[]): string | undefined {
  for (const key of keys) {
    if (obj && typeof obj[key] === 'string') return obj[key];
  }
  return undefined;
}

function extractContent(obj: any): string | undefined {
  if (!obj) return undefined;
  // Direct content fields
  const direct = pickString(obj, ['content', 'text', 'body', 'intro', 'summary', 'desc', 'description']);
  if (direct) return direct;

  // Chapters array
  const chapters = obj.chapters || obj.articles || obj.sections || obj.items;
  if (Array.isArray(chapters)) {
    return chapters
      .map((chapter) => {
        if (typeof chapter === 'string') return chapter;
        const title = pickString(chapter, ['title', 'name', 'chapterTitle', 'chapter']);
        const body = pickString(chapter, ['content', 'text', 'body']);
        return [title, body].filter(Boolean).join('\n\n');
      })
      .filter(Boolean)
      .join('\n\n');
  }

  return undefined;
}

function parseJsonBooks(raw: string): BookInput[] {
  const parsed = JSON.parse(raw);

  // Some repos wrap books in a root object like { "books": [...], "data": [...] }
  let candidates: any[] = Array.isArray(parsed) ? parsed : [parsed];
  if (!Array.isArray(parsed)) {
    for (const key of ['books', 'data', 'list', 'items', 'result']) {
      if (Array.isArray(parsed[key])) {
        candidates = parsed[key];
        break;
      }
    }
  }

  const books: BookInput[] = [];
  for (const item of candidates) {
    if (!item || typeof item !== 'object') continue;
    const title = pickString(item, ['title', 'name', 'bookName', 'bookTitle', 'book']);
    const content = extractContent(item);
    if (!title || !content) continue;
    books.push({
      title,
      author: pickString(item, ['author', 'writer', 'authorName', 'penname']),
      description: pickString(item, ['description', 'desc', 'intro', 'summary']),
      content,
      cover: pickString(item, ['cover', 'coverUrl', 'image', 'img']),
      category: pickString(item, ['category', 'genre', 'type', 'classify']),
      tags: pickString(item, ['tags', 'tag', 'labels', 'label']),
    });
  }
  return books;
}

function importFromFile(db: Database, filePath: string, sourceLabel: string) {
  const fs = require('fs');
  const path = require('path');
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!raw.trim()) return [];
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath, path.extname(filePath));

  if (ext === '.json') {
    const books = parseJsonBooks(raw);
    if (books.length === 0) {
      throw new Error(`无法从 ${fileName}.json 中识别出有效的书籍数据，请检查 JSON 中是否包含 title 和 content 字段`);
    }
    return books.map((b) => insertImportedBook(db, b, sourceLabel));
  }

  const parsed = parseBookText(raw, fileName);
  return [insertImportedBook(db, { title: parsed.title, author: parsed.author, content: parsed.content }, sourceLabel)];
}
