import type { Database } from 'better-sqlite3';
import * as bookSourceEngine from '../bookSourceEngine';
import { parseChapters } from '../handlers/book';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

const INITIAL_CHAPTER_COUNT = 10;
const BACKGROUND_BATCH_SIZE = 20;
const BACKGROUND_CONCURRENCY = 5;
const CHAPTER_FETCH_TIMEOUT = 15000;

export type ImportTaskStatus = 'running' | 'paused' | 'completed' | 'error' | 'cancelled';

export interface ImportProgress {
  bookId: number;
  status: ImportTaskStatus;
  completed: number;
  total: number;
  message?: string;
}

type ProgressCallback = (progress: ImportProgress) => void;

interface ImportTask {
  bookId: number;
  sourceId: number;
  config: bookSourceEngine.BookSourceConfig;
  remaining: bookSourceEngine.Chapter[];
  completed: number;
  total: number;
  status: ImportTaskStatus;
  abortController: AbortController;
}

const tasks = new Map<number, ImportTask>();
let progressCallback: ProgressCallback | null = null;

function getImportTasksFilePath(): string {
  return path.join(app.getPath('userData'), 'import_tasks.json');
}

function persistTasks(): void {
  try {
    const payload = Array.from(tasks.values()).map((task) => ({
      bookId: task.bookId,
      sourceId: task.sourceId,
      config: task.config,
      remaining: task.remaining,
      completed: task.completed,
      total: task.total,
      status: task.status,
    }));
    fs.writeFileSync(getImportTasksFilePath(), JSON.stringify(payload));
  } catch (err) {
    console.error('[import-service] 持久化任务失败:', err instanceof Error ? err.message : String(err));
  }
}

export function loadPersistedImportTasks(db: Database): void {
  try {
    const filePath = getImportTasksFilePath();
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
      return;
    }
    let list: Omit<ImportTask, 'abortController'>[];
    try {
      list = JSON.parse(raw);
    } catch (parseErr) {
      console.error('[import-service] 任务文件损坏，已清空:', parseErr instanceof Error ? parseErr.message : String(parseErr));
      try {
        fs.unlinkSync(filePath);
      } catch {}
      return;
    }
    for (const item of list) {
      // 应用重启后，未完成的任务统一置为暂停，避免自动大量请求
      const task: ImportTask = {
        ...item,
        status: item.status === 'running' ? 'paused' : item.status,
        abortController: new AbortController(),
      };
      tasks.set(task.bookId, task);
      // 启动后台循环，等待用户点击继续
      runBackgroundImport(db, task);
      reportProgress({
        bookId: task.bookId,
        status: task.status,
        completed: task.completed,
        total: task.total,
        message: '已暂停',
      });
    }
    console.log(`[import-service] 已恢复 ${list.length} 个未完成的导入任务`);
  } catch (err) {
    console.error('[import-service] 恢复任务失败:', err instanceof Error ? err.message : String(err));
  }
}

export function setImportProgressCallback(callback: ProgressCallback | null): void {
  progressCallback = callback;
}

function reportProgress(progress: ImportProgress): void {
  progressCallback?.(progress);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function taskStatus(task: ImportTask): ImportTaskStatus {
  return task.status;
}

function extractChapterNumber(title: string): number | null {
  const match = title.match(/^\s*第\s*([0-9一二两三四五六七八九十百千万]+)\s*[章节回卷篇幕部集]/);
  if (match) {
    return parseChineseNumber(match[1]);
  }
  const plainMatch = title.match(/^\s*([0-9]+)([\.、\s].*)?$/);
  if (plainMatch) {
    return Number(plainMatch[1]);
  }
  return null;
}

function parseChineseNumber(str: string): number | null {
  const trimmed = str.trim();
  // 纯阿拉伯数字直接返回
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    return num > 0 ? num : null;
  }

  const map: Record<string, number> = {
    零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
    六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 百: 100, 千: 1000, 万: 10000,
  };
  let result = 0;
  let temp = 0;
  for (const char of trimmed) {
    const value = map[char];
    if (value === undefined) continue;
    if (value >= 10) {
      if (temp === 0) temp = 1;
      result += temp * value;
      temp = 0;
    } else {
      temp = temp * 10 + value;
    }
  }
  result += temp;
  return result || null;
}

function sortChaptersByNumber(chapters: bookSourceEngine.Chapter[]): bookSourceEngine.Chapter[] {
  if (chapters.length < 2) return chapters;

  return [...chapters].sort((a, b) => {
    const an = extractChapterNumber(a.title);
    const bn = extractChapterNumber(b.title);
    // 无数字的标题（前言/楔子等）排在最后面
    if (an === null && bn === null) return 0;
    if (an === null) return 1;
    if (bn === null) return -1;
    return an - bn;
  });
}

async function fetchChapterContent(
  config: bookSourceEngine.BookSourceConfig,
  chapter: bookSourceEngine.Chapter,
  signal: AbortSignal
): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(null);
    }, CHAPTER_FETCH_TIMEOUT);

    const checkAbort = () => {
      if (signal.aborted) {
        clearTimeout(timeout);
        resolve(null);
      }
    };
    const abortInterval = setInterval(checkAbort, 100);

    bookSourceEngine
      .getChapterContent(config, chapter.url)
      .then((content) => {
        clearTimeout(timeout);
        clearInterval(abortInterval);
        resolve(content && content.trim().length > 0 ? `${chapter.title}\n${content}` : null);
      })
      .catch((err) => {
        clearTimeout(timeout);
        clearInterval(abortInterval);
        console.warn(`[import-service] fetch failed: ${chapter.title}`, err instanceof Error ? err.message : String(err));
        resolve(null);
      });
  });
}

async function fetchBatchWithConcurrency(
  config: bookSourceEngine.BookSourceConfig,
  chapters: bookSourceEngine.Chapter[],
  concurrency: number,
  signal: AbortSignal
): Promise<string[]> {
  const results: (string | null)[] = new Array(chapters.length).fill(null);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < chapters.length) {
      if (signal.aborted) return;
      const i = index++;
      results[i] = await fetchChapterContent(config, chapters[i], signal);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  return results.filter((text): text is string => text !== null);
}

function insertBookRecord(
  db: Database,
  detail: bookSourceEngine.BookDetail,
  config: bookSourceEngine.BookSourceConfig,
  bookUrl: string,
  chapterTexts: string[],
  sourceId?: number
): number {
  const title = detail.name || extractTitleFromUrl(bookUrl);
  if (!title) throw new Error('无法识别书名');

  const fullContent = chapterTexts.join('\n\n');
  if (!fullContent.trim()) {
    throw new Error(`《${title}》未能获取到任何有效章节内容，导入已取消`);
  }

  const cover = detail.coverUrl || getRandomCover();
  const insertBook = db.prepare(
    'INSERT INTO books (title, author, description, content, cover, category, tags, source_id, source_book_url, cover_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertChapter = db.prepare(
    'INSERT INTO book_chapters (book_id, title, start_paragraph, end_paragraph, sort_order) VALUES (?, ?, ?, ?, ?)'
  );

  return db.transaction(() => {
    const inserted = insertBook.run(
      title,
      detail.author,
      detail.intro,
      fullContent,
      cover,
      detail.kind || '网络小说',
      `书源,${config.bookSourceName}`,
      sourceId ?? null,
      bookUrl,
      detail.coverUrl || ''
    );
    const id = Number(inserted.lastInsertRowid);
    insertParsedChapters(db, id, fullContent);
    return id;
  })();
}

function appendBookContent(db: Database, bookId: number, chapterTexts: string[]): void {
  if (chapterTexts.length === 0) return;

  const book = db.prepare('SELECT content FROM books WHERE id = ?').get(bookId) as { content: string } | undefined;
  if (!book) throw new Error('Book not found');

  const existingParagraphs = book.content.split(/\n+/).length;
  const newContent = chapterTexts.join('\n\n');
  const fullContent = book.content + '\n\n' + newContent;

  db.prepare("UPDATE books SET content = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(fullContent, bookId);
  insertParsedChapters(db, bookId, newContent, existingParagraphs);
}

function insertParsedChapters(
  db: Database,
  bookId: number,
  content: string,
  paragraphOffset = 0
): void {
  const parsedChapters = parseChapters(content);
  if (parsedChapters.length <= 1) return;

  const existingCount = db.prepare('SELECT COUNT(*) as count FROM book_chapters WHERE book_id = ?').get(bookId) as { count: number };
  const baseSortOrder = existingCount.count;

  const insertChapter = db.prepare(
    'INSERT INTO book_chapters (book_id, title, start_paragraph, end_paragraph, sort_order) VALUES (?, ?, ?, ?, ?)'
  );

  parsedChapters.forEach((chapter, index) => {
    insertChapter.run(
      bookId,
      chapter.title,
      chapter.startParagraph + paragraphOffset,
      chapter.endParagraph + paragraphOffset,
      baseSortOrder + index
    );
  });
}

function getRandomCover(): string {
  const palette = ['#C4A77D', '#A89F91', '#8B7355', '#B8A99A', '#9E8B7D', '#7D8B8B', '#9A8B7A', '#8B9A7A'];
  return palette[Math.floor(Math.random() * palette.length)];
}

function extractTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const lastSegment = pathname.split('/').pop() || '';
    return decodeURIComponent(lastSegment).replace(/\.html?$/, '').replace(/[_-]/g, ' ').slice(0, 50);
  } catch {
    return '';
  }
}

export async function importBookWithLazyLoading(
  db: Database,
  sourceId: number,
  bookUrl: string,
  chapterLimit = 9999
): Promise<{ id: number; title: string; status: ImportTaskStatus }> {
  const row = db.prepare('SELECT * FROM book_sources WHERE id = ? AND deleted = 0').get(sourceId) as { config: string } | undefined;
  if (!row) throw new Error('Book source not found');
  const config = JSON.parse(row.config) as bookSourceEngine.BookSourceConfig;

  // Idempotency: if the same online book has already been imported, return the existing local copy
  const existing = db.prepare(
    'SELECT id, title FROM books WHERE source_id = ? AND source_book_url = ? AND deleted = 0'
  ).get(sourceId, bookUrl) as { id: number; title: string } | undefined;
  if (existing) {
    console.log(`[import-service] existing book found: id=${existing.id}, title=${existing.title}`);
    return { id: existing.id, title: existing.title, status: 'completed' };
  }

  console.log(`[import-service] start: ${bookUrl}`);

  const detail = await bookSourceEngine.getBookDetail(config, bookUrl);
  console.log(`[import-service] detail: name=${detail.name}, author=${detail.author}`);

  let tocUrl = detail.tocUrl || bookUrl;
  let chapters = await bookSourceEngine.getChapterList(config, tocUrl);
  if (chapters.length === 0 && tocUrl !== bookUrl) {
    chapters = await bookSourceEngine.getChapterList(config, bookUrl);
  }

  chapters = sortChaptersByNumber(chapters);
  chapters = chapters.slice(0, chapterLimit);
  console.log(`[import-service] total chapters: ${chapters.length}`);

  if (chapters.length === 0) {
    throw new Error('未能获取到章节列表');
  }

  const initialChapters = chapters.slice(0, INITIAL_CHAPTER_COUNT);
  const remaining = chapters.slice(INITIAL_CHAPTER_COUNT);

  // 并发抓取前 10 章
  const signal = new AbortController().signal;
  const initialTexts = await fetchBatchWithConcurrency(config, initialChapters, BACKGROUND_CONCURRENCY, signal);

  const title = detail.name || extractTitleFromUrl(bookUrl);
  if (!title) throw new Error('无法识别书名');

  if (initialTexts.length === 0) {
    throw new Error(`《${title}》前 ${INITIAL_CHAPTER_COUNT} 章全部获取失败，导入已取消`);
  }

  const bookId = insertBookRecord(db, detail, config, bookUrl, initialTexts, sourceId);
  const completed = initialTexts.length;
  const total = chapters.length;

  console.log(`[import-service] initial import done: id=${bookId}, completed=${completed}/${total}`);

  reportProgress({
    bookId,
    status: remaining.length > 0 ? 'running' : 'completed',
    completed,
    total,
    message: remaining.length > 0 ? '已导入前 10 章，后台补充中' : '导入完成',
  });

  if (remaining.length > 0) {
    const abortController = new AbortController();
    const task: ImportTask = {
      bookId,
      sourceId,
      config,
      remaining,
      completed,
      total,
      status: 'running',
      abortController,
    };
    tasks.set(bookId, task);
    persistTasks();
    runBackgroundImport(db, task);
  }

  return { id: bookId, title, status: remaining.length > 0 ? 'running' : 'completed' };
}

async function runBackgroundImport(db: Database, task: ImportTask): Promise<void> {
  try {
    while (task.remaining.length > 0 && task.status !== 'cancelled') {
      while (taskStatus(task) === 'paused') {
        await sleep(1000);
        if (taskStatus(task) === 'cancelled') return;
      }

      const batch = task.remaining.splice(0, BACKGROUND_BATCH_SIZE);
      const texts = await fetchBatchWithConcurrency(task.config, batch, BACKGROUND_CONCURRENCY, task.abortController.signal);

      if (texts.length > 0) {
        appendBookContent(db, task.bookId, texts);
        task.completed += texts.length;
      }

      reportProgress({
        bookId: task.bookId,
        status: task.status,
        completed: task.completed,
        total: task.total,
        message: taskStatus(task) === 'paused' ? '已暂停' : '后台补充中',
      });
      persistTasks();

      if (task.status === 'running' && task.remaining.length > 0) {
        await sleep(200);
      }
    }

    if (task.status !== 'cancelled') {
      task.status = 'completed';
      reportProgress({
        bookId: task.bookId,
        status: 'completed',
        completed: task.completed,
        total: task.total,
        message: '导入完成',
      });
      persistTasks();
    }
  } catch (err) {
    console.error(`[import-service] background error for book ${task.bookId}:`, err);
    task.status = 'error';
    reportProgress({
      bookId: task.bookId,
      status: 'error',
      completed: task.completed,
      total: task.total,
      message: err instanceof Error ? err.message : '后台导入失败',
    });
    persistTasks();
  } finally {
    if (task.status === 'completed' || task.status === 'cancelled' || task.status === 'error') {
      tasks.delete(task.bookId);
      persistTasks();
    }
  }
}

export function pauseImport(bookId: number): boolean {
  const task = tasks.get(bookId);
  if (!task || task.status !== 'running') return false;
  task.status = 'paused';
  persistTasks();
  reportProgress({
    bookId,
    status: 'paused',
    completed: task.completed,
    total: task.total,
    message: '已暂停',
  });
  return true;
}

export function resumeImport(bookId: number, db?: Database): boolean {
  const task = tasks.get(bookId);
  if (!task || task.status === 'running' || task.status === 'completed') return false;

  // 取消/失败后需要新的 AbortController 并重启后台循环
  if (task.status === 'cancelled' || task.status === 'error') {
    task.abortController = new AbortController();
    task.status = 'running';
    persistTasks();
    reportProgress({
      bookId,
      status: 'running',
      completed: task.completed,
      total: task.total,
      message: '后台补充中',
    });
    if (db) {
      runBackgroundImport(db, task);
    }
    return true;
  }

  task.status = 'running';
  persistTasks();
  reportProgress({
    bookId,
    status: 'running',
    completed: task.completed,
    total: task.total,
    message: '后台补充中',
  });
  return true;
}

export function cancelImport(bookId: number): boolean {
  const task = tasks.get(bookId);
  if (!task) return false;
  task.status = 'cancelled';
  task.abortController.abort();
  persistTasks();
  reportProgress({
    bookId,
    status: 'cancelled',
    completed: task.completed,
    total: task.total,
    message: '已取消',
  });
  return true;
}

export function getImportProgress(bookId: number): ImportProgress | null {
  const task = tasks.get(bookId);
  if (!task) return null;
  return {
    bookId,
    status: task.status,
    completed: task.completed,
    total: task.total,
    message: task.status === 'paused' ? '已暂停' : '后台补充中',
  };
}

export function getAllImportProgress(): ImportProgress[] {
  return Array.from(tasks.values()).map((task) => ({
    bookId: task.bookId,
    status: task.status,
    completed: task.completed,
    total: task.total,
    message: task.status === 'paused' ? '已暂停' : '后台补充中',
  }));
}

export function cancelAllImports(): void {
  for (const [bookId, task] of tasks) {
    task.status = 'cancelled';
    task.abortController.abort();
  }
  tasks.clear();
  persistTasks();
}
