import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import http from 'http';
import https from 'https';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { initDatabase, closeDatabase, getDatabase } from './database';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './global-shortcut';
import * as bookSourceEngine from './bookSourceEngine';
import { getAppSettings, setAppSetting, resetAppSettings, type AppSettings } from './settings';

let mainWindow: BrowserWindow | null = null;
let localServiceProcess: ChildProcess | null = null;

// Ignore EPIPE errors when stdout/stderr pipes are closed (e.g. dev server restart)
function ignoreEpipe(err: Error & { code?: string }): void {
  if (err.code !== 'EPIPE') {
    // eslint-disable-next-line no-console
    console.error('stream error:', err);
  }
}
process.stdout.on('error', ignoreEpipe);
process.stderr.on('error', ignoreEpipe);

const COVER_PALETTE = ['#C4A77D', '#A89F91', '#8B7355', '#B8A99A', '#9E8B7D', '#7D8B8B', '#9A8B7A', '#8B9A7A'];

const LOCAL_SERVICE_PORT = process.env.CIGE_RHYME_PORT || '8792';
const LOCAL_SERVICE_START_TIMEOUT = 30000;

interface HotTrendItem {
  platform: string;
  rank: number;
  title: string;
  hot_value: number | string;
  link: string;
  cover?: string | null;
  label?: string;
  fetched_at?: string;
}

interface HotTrendsPayload {
  success?: boolean;
  data?: HotTrendItem[];
  from_cache?: boolean;
}

interface QuoteItem {
  id: string | number;
  platform: string;
  category?: string;
  title: string;
  content: string;
  source?: string;
  from_who?: string;
  hot_value?: number | string;
  link?: string;
  cover?: string | null;
  label?: string;
  fetched_at?: string;
}

interface QuotesPayload {
  success?: boolean;
  data?: QuoteItem[];
  from_cache?: boolean;
}

const HOT_TRENDS_CACHE_FILE = path.join(__dirname, '..', '..', '..', 'tools', 'hot_trends_cache.json');
const QUOTES_CACHE_FILE = path.join(__dirname, '..', '..', '..', 'tools', 'quotes_cache.json');

function isLocalServiceRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${LOCAL_SERVICE_PORT}/`, { timeout: 3000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForLocalService(): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < LOCAL_SERVICE_START_TIMEOUT) {
    if (await isLocalServiceRunning()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function startLocalService(): Promise<boolean> {
  return new Promise((resolve) => {
    const projectRoot = path.join(__dirname, '..', '..', '..');
    const scriptPath = path.join(projectRoot, 'tools', 'rhyme_server.py');

    if (!fs.existsSync(scriptPath)) {
      console.log('[LocalService] 未找到 Python 服务脚本:', scriptPath);
      resolve(false);
      return;
    }

    const env = {
      ...process.env,
      REDFOX_API_KEY: process.env.REDFOX_API_KEY || '',
    };

    console.log('[LocalService] 正在启动 Python 本地数据服务...');
    localServiceProcess = spawn('python3', [scriptPath], {
      cwd: projectRoot,
      env,
      stdio: 'pipe',
      detached: false,
    });

    localServiceProcess.stdout?.on('data', (data) => {
      console.log(`[LocalService] ${data.toString().trim()}`);
    });
    localServiceProcess.stderr?.on('data', (data) => {
      console.error(`[LocalService] ${data.toString().trim()}`);
    });
    localServiceProcess.on('error', (err) => {
      console.log('[LocalService] 启动失败:', err.message);
      resolve(false);
    });
    localServiceProcess.on('exit', (code) => {
      console.log(`[LocalService] 进程退出，code=${code}`);
      localServiceProcess = null;
    });

    waitForLocalService().then(resolve);
  });
}

async function ensureLocalService(): Promise<boolean> {
  if (await isLocalServiceRunning()) {
    console.log('[LocalService] 本地数据服务已在运行');
    return true;
  }
  return startLocalService();
}

async function fetchJsonFromLocalService<T>(url: string): Promise<T | null> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 20000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function syncHotTrendsToInspirations(): Promise<void> {
  const db = getDatabase();
  const serviceUrl = `http://127.0.0.1:${LOCAL_SERVICE_PORT}/hot-trends?platforms=douyin,xiaohongshu`;

  let payload: HotTrendsPayload | null = null;

  try {
    payload = await fetchJsonFromLocalService<HotTrendsPayload>(serviceUrl);
  } catch (e) {
    console.log('[HotTrends] 本地服务未就绪，尝试读取缓存文件');
  }

  // fallback：如果服务不可用，读取 Python 服务的本地 JSON 缓存
  if (!payload?.success && fs.existsSync(HOT_TRENDS_CACHE_FILE)) {
    try {
      const raw = fs.readFileSync(HOT_TRENDS_CACHE_FILE, 'utf-8');
      payload = JSON.parse(raw) as HotTrendsPayload;
      console.log('[HotTrends] 已从缓存文件恢复');
    } catch (e) {
      console.log('[HotTrends] 缓存文件读取失败', e);
    }
  }

  const items = payload?.data || [];
  if (items.length === 0) {
    console.log('[HotTrends] 没有可用的热榜数据');
    return;
  }

  // 删除旧的热榜灵感
  db.prepare("DELETE FROM inspirations WHERE tags LIKE '%热榜%'").run();

  const insert = db.prepare('INSERT INTO inspirations (content, tags) VALUES (?, ?)');
  const insertMany = db.transaction((rows: HotTrendItem[]) => {
    for (const item of rows) {
      const platformName = item.platform === 'douyin' ? '抖音' : '小红书';
      const content = `${item.title}`;
      const tags = `热榜,${platformName},${item.platform}`;
      insert.run(content, tags);
    }
  });

  insertMany(items);
  console.log(`[HotTrends] 已同步 ${items.length} 条热榜灵感到数据库`);
}

async function syncQuotesToInspirations(): Promise<void> {
  const db = getDatabase();
  const serviceUrl = `http://127.0.0.1:${LOCAL_SERVICE_PORT}/quotes?types=hitokoto,netease,tag&limit=30`;

  let payload: QuotesPayload | null = null;

  try {
    payload = await fetchJsonFromLocalService<QuotesPayload>(serviceUrl);
  } catch (e) {
    console.log('[Quotes] 本地服务未就绪，尝试读取缓存文件');
  }

  // fallback：如果服务不可用，读取 Python 服务的本地 JSON 缓存
  if (!payload?.success && fs.existsSync(QUOTES_CACHE_FILE)) {
    try {
      const raw = fs.readFileSync(QUOTES_CACHE_FILE, 'utf-8');
      payload = JSON.parse(raw) as QuotesPayload;
      console.log('[Quotes] 已从缓存文件恢复');
    } catch (e) {
      console.log('[Quotes] 缓存文件读取失败', e);
    }
  }

  const items = payload?.data || [];
  if (items.length === 0) {
    console.log('[Quotes] 没有可用的金句数据');
    return;
  }

  // 删除旧的金句/文案灵感
  db.prepare("DELETE FROM inspirations WHERE tags LIKE '%金句%'").run();

  const insert = db.prepare('INSERT INTO inspirations (content, tags) VALUES (?, ?)');
  const insertMany = db.transaction((rows: QuoteItem[]) => {
    for (const item of rows) {
      const content = item.content || item.title || '';
      const platformLabel = item.platform === 'netease' ? '网易云热评' : item.platform === 'hitokoto' ? '一言' : '小红书';
      const tags = `金句,${platformLabel},${item.platform}`;
      insert.run(content, tags);
    }
  });

  insertMany(items);
  console.log(`[Quotes] 已同步 ${items.length} 条金句/文案灵感到数据库`);
}

async function syncMoreHotTrendsToInspirations(targetMin: number = 50): Promise<number> {
  const db = getDatabase();
  const existingRows = db.prepare("SELECT content FROM inspirations WHERE tags LIKE '%热榜%'").all() as { content: string }[];
  const existing = new Set(existingRows.map((r) => r.content));

  let totalAdded = 0;
  let attempts = 0;
  const maxAttempts = 3;

  while (totalAdded < targetMin && attempts < maxAttempts) {
    attempts += 1;
    const serviceUrl = `http://127.0.0.1:${LOCAL_SERVICE_PORT}/hot-trends?platforms=douyin,xiaohongshu&skip_cache=1`;

    let payload: HotTrendsPayload | null = null;
    try {
      payload = await fetchJsonFromLocalService<HotTrendsPayload>(serviceUrl);
    } catch (e) {
      console.log('[HotTrends] 加载更多失败', e);
      break;
    }

    const items = payload?.data || [];
    if (items.length === 0) break;

    const newItems = items.filter((item) => item.title && !existing.has(item.title));

    if (newItems.length === 0) {
      console.log('[HotTrends] 本批次没有新的热榜数据');
      continue;
    }

    const insert = db.prepare('INSERT INTO inspirations (content, tags) VALUES (?, ?)');
    const insertMany = db.transaction((rows: HotTrendItem[]) => {
      for (const item of rows) {
        existing.add(item.title);
        const platform = item.platform === 'douyin' ? '抖音' : '小红书';
        const tags = `热榜,${platform},${item.platform}`;
        insert.run(item.title, tags);
      }
    });

    insertMany(newItems);
    totalAdded += newItems.length;
    console.log(`[HotTrends] 第 ${attempts} 批追加 ${newItems.length} 条，累计 ${totalAdded} 条`);
  }

  console.log(`[HotTrends] 已追加 ${totalAdded} 条热榜灵感`);
  return totalAdded;
}

async function syncMoreQuotesToInspirations(targetMin: number = 50): Promise<number> {
  const db = getDatabase();
  const existingRows = db.prepare("SELECT content FROM inspirations WHERE tags LIKE '%金句%'").all() as { content: string }[];
  const existing = new Set(existingRows.map((r) => r.content));

  let totalAdded = 0;
  let attempts = 0;
  const maxAttempts = 5;

  while (totalAdded < targetMin && attempts < maxAttempts) {
    attempts += 1;
    const serviceUrl = `http://127.0.0.1:${LOCAL_SERVICE_PORT}/quotes?types=hitokoto,netease,tag&limit=50&skip_cache=1`;

    let payload: QuotesPayload | null = null;
    try {
      payload = await fetchJsonFromLocalService<QuotesPayload>(serviceUrl);
    } catch (e) {
      console.log('[Quotes] 加载更多失败', e);
      break;
    }

    const items = payload?.data || [];
    if (items.length === 0) break;

    const newItems = items.filter((item) => {
      const content = item.content || item.title || '';
      return content && !existing.has(content);
    });

    if (newItems.length === 0) {
      console.log('[Quotes] 本批次没有新的金句数据');
      continue;
    }

    const insert = db.prepare('INSERT INTO inspirations (content, tags) VALUES (?, ?)');
    const insertMany = db.transaction((rows: QuoteItem[]) => {
      for (const item of rows) {
        const content = item.content || item.title || '';
        existing.add(content);
        const platformLabel = item.platform === 'netease' ? '网易云热评' : item.platform === 'hitokoto' ? '一言' : '小红书';
        const tags = `金句,${platformLabel},${item.platform}`;
        insert.run(content, tags);
      }
    });

    insertMany(newItems);
    totalAdded += newItems.length;
    console.log(`[Quotes] 第 ${attempts} 批追加 ${newItems.length} 条，累计 ${totalAdded} 条`);
  }

  console.log(`[Quotes] 已追加 ${totalAdded} 条金句/文案灵感`);
  return totalAdded;
}

function readVitePortFromFile(): number | null {
  try {
    const portFile = path.join(process.cwd(), '.vite-port');
    if (fs.existsSync(portFile)) {
      const content = fs.readFileSync(portFile, 'utf-8').trim();
      const port = parseInt(content, 10);
      if (!isNaN(port) && port > 0) {
        return port;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function probeDevServerPort(basePort: number): Promise<number> {
  return new Promise((resolve) => {
    let port = basePort;
    const tryPort = () => {
      if (port > basePort + 20) {
        console.log(`[Dev] 未找到可用 Vite 端口，回退到 ${basePort}`);
        resolve(basePort);
        return;
      }
      const req = http.get(`http://localhost:${port}/`, { timeout: 200 }, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          console.log(`[Dev] 使用 Vite 端口 ${port}`);
          resolve(port);
        } else {
          port++;
          tryPort();
        }
      });
      req.on('error', () => {
        port++;
        tryPort();
      });
      req.on('timeout', () => {
        req.destroy();
        port++;
        tryPort();
      });
    };
    tryPort();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findDevServerPort(basePort: number): Promise<number> {
  // 等待 Vite 启动并写入端口文件，最多等待 10 秒
  for (let i = 0; i < 40; i++) {
    const filePort = readVitePortFromFile();
    if (filePort) {
      console.log(`[Dev] 从文件读取到 Vite 端口 ${filePort}`);
      return filePort;
    }
    await delay(250);
  }
  console.log('[Dev] 未找到端口文件，开始探测端口');
  return probeDevServerPort(basePort);
}

async function createMainWindow(): Promise<BrowserWindow> {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'build', 'icon.png')
    : path.join(__dirname, '..', '..', 'build', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '词歌 CiGe',
    icon: iconPath,
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#F2F2F4',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
  },
  });

  if (process.platform === 'darwin' && !app.isPackaged && fs.existsSync(iconPath)) {
    app.dock.setIcon(iconPath);
  }

  const isDev = !app.isPackaged;
  if (isDev) {
    const basePort = parseInt(process.env.VITE_PORT || '5173', 10);
    const port = await findDevServerPort(basePort);
    const url = `http://localhost:${port}`;
    console.log(`[Dev] 加载渲染进程: ${url}`);
    mainWindow.loadURL(url);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../..', 'renderer', 'index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    console.log(`[Window] 页面加载完成: ${mainWindow?.webContents.getURL()}`);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Window] 页面加载失败: ${validatedURL}`, errorCode, errorDescription);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  return mainWindow;
}

function registerIpcHandlers(): void {
  const db = getDatabase();

  // ---- Writings ----
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
      values.push(data.content.length);
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
    db.prepare(
      "INSERT INTO writing_snapshots (writing_id, content) VALUES (?, ?)"
    ).run(writingId, content);
    return true;
  });

  // ---- Excerpts ----
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

  // ---- Inspirations ----
  ipcMain.handle('inspiration:get-all', () => {
    return db.prepare('SELECT * FROM inspirations WHERE deleted = 0 ORDER BY created_at DESC').all();
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
      const result = db.prepare("UPDATE inspirations SET deleted = 1 WHERE id = ?").run(id);
      console.log(`Delete result: ${result.changes} rows affected`);
      return result.changes > 0;
    } catch (error) {
      console.error('Failed to delete inspiration:', error);
      throw error;
    }
  });

  ipcMain.handle('hot-trends:fetch-more', async () => {
    try {
      return await syncMoreHotTrendsToInspirations();
    } catch (error) {
      console.error('Failed to fetch more hot trends:', error);
      return 0;
    }
  });

  ipcMain.handle('quotes:fetch-more', async () => {
    try {
      return await syncMoreQuotesToInspirations();
    } catch (error) {
      console.error('Failed to fetch more quotes:', error);
      return 0;
    }
  });

  // ---- Books (Library) ----
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
      "UPDATE books SET title = ?, author = ?, description = ?, content = ?, cover = ?, category = ?, tags = ?, updated_at = datetime('now', 'localtime') WHERE id = ?"
    ).run(next.title, next.author, next.description, next.content, next.cover, next.category, next.tags, id);
    return { id, ...next, is_favorite: current.is_favorite };
  });

  // ---- Book Sources ----
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
      const raw = fs.readFileSync(filePath, 'utf-8');
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

  ipcMain.handle('book-source:import-book', async (_event, sourceId: number, bookUrl: string, chapterLimit = 500) => {
    const row = db.prepare('SELECT * FROM book_sources WHERE id = ? AND deleted = 0').get(sourceId) as { config: string } | undefined;
    if (!row) throw new Error('Book source not found');
    const config = JSON.parse(row.config) as bookSourceEngine.BookSourceConfig;

    console.log(`[import-book] start: ${bookUrl}`);
    const detail = await bookSourceEngine.getBookDetail(config, bookUrl);
    console.log(`[import-book] detail: name=${detail.name}, author=${detail.author}, tocUrl=${detail.tocUrl}`);

    let tocUrl = detail.tocUrl || bookUrl;
    let chapters = await bookSourceEngine.getChapterList(config, tocUrl);
    console.log(`[import-book] chapters from ${tocUrl}: ${chapters.length}`);

    // If no chapters from TOC URL, try the book URL itself as a fallback
    if (chapters.length === 0 && tocUrl !== bookUrl) {
      chapters = await bookSourceEngine.getChapterList(config, bookUrl);
      console.log(`[import-book] chapters fallback to bookUrl: ${chapters.length}`);
    }

    const limitedChapters = chapters.slice(0, chapterLimit);

    const chapterTexts: string[] = [];
    for (const chapter of limitedChapters) {
      try {
        const content = await bookSourceEngine.getChapterContent(config, chapter.url);
        if (content && content.trim().length > 0) {
          chapterTexts.push(`${chapter.title}\n${content}`);
        } else {
          console.warn(`[import-book] empty content: ${chapter.title} -> ${chapter.url}`);
        }
      } catch (err) {
        console.warn(`[import-book] content error: ${chapter.title}`, err instanceof Error ? err.message : String(err));
      }
    }

    const title = detail.name || extractTitleFromUrl(bookUrl);
    if (!title) throw new Error('无法识别书名');

    const fullContent = chapterTexts.join('\n\n');
    if (!fullContent.trim()) {
      console.warn(`[import-book] no content fetched for ${title}`);
    }

    const cover = detail.coverUrl || COVER_PALETTE[Math.floor(Math.random() * COVER_PALETTE.length)];
    const insert = db.prepare(
      'INSERT INTO books (title, author, description, content, cover, category, tags) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const inserted = insert.run(
      title,
      detail.author,
      detail.intro,
      fullContent,
      cover,
      config.bookSourceGroup || '网络小说',
      `书源,${config.bookSourceName}`
    );
    console.log(`[import-book] done: id=${inserted.lastInsertRowid}, contentLength=${fullContent.length}`);
    return { id: inserted.lastInsertRowid, title };
  });

  function extractTitleFromUrl(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const segments = pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1] || '';
      return decodeURIComponent(last.replace(/\.html?$/i, '').replace(/[_-]/g, ' ')).trim();
    } catch {
      return '';
    }
  }

  // Book import helpers
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

  interface BookInput {
    title: string;
    author?: string;
    content: string;
    description?: string;
    cover?: string;
    category?: string;
    tags?: string;
  }

  function parseChapters(content: string): { title: string; startParagraph: number; endParagraph: number }[] {
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

  function insertImportedBook(parsed: BookInput, sourceLabel: string) {
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

  function importFromFile(filePath: string, sourceLabel: string) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return [];
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath, path.extname(filePath));

    if (ext === '.json') {
      const books = parseJsonBooks(raw);
      if (books.length === 0) {
        throw new Error(`无法从 ${fileName}.json 中识别出有效的书籍数据，请检查 JSON 中是否包含 title 和 content 字段`);
      }
      return books.map((b) => insertImportedBook(b, sourceLabel));
    }

    const parsed = parseBookText(raw, fileName);
    return [insertImportedBook({ title: parsed.title, author: parsed.author, content: parsed.content }, sourceLabel)];
  }

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
        imported.push(...importFromFile(filePath, '导入书源'));
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
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    const imported: ReturnType<typeof insertImportedBook>[] = [];
    let lastError: Error | null = null;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!['.txt', '.md', '.json'].includes(ext)) continue;
      const filePath = path.join(folderPath, entry.name);
      try {
        imported.push(...importFromFile(filePath, '导入书源'));
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
    return insertImportedBook({ title, author: '', content: stripped }, '网络书源');
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

  // ---- Folders ----
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

  // ---- Recycle Bin ----
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:get-settings', () => getAppSettings());
  ipcMain.handle('app:set-setting', (_event, key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => {
    setAppSetting(key, value);
    return true;
  });
  ipcMain.handle('app:reset-settings', () => {
    resetAppSettings();
    return getAppSettings();
  });

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

app.whenReady().then(async () => {
  initDatabase();
  registerIpcHandlers();

  // 确保本地 Python 数据服务已启动（会自动传递 REDFOX_API_KEY）
  const serviceReady = await ensureLocalService();

  // 启动时自动同步抖音、小红书热榜/爆火文案到灵感库
  const appSettings = getAppSettings();
  if (serviceReady && appSettings.autoSyncOnLaunch) {
    try {
      await syncHotTrendsToInspirations();
    } catch (e) {
      console.log('[HotTrends] 同步失败', e);
    }
    try {
      await syncQuotesToInspirations();
    } catch (e) {
      console.log('[Quotes] 同步失败', e);
    }
  } else {
    console.log('[HotTrends] 本地服务未就绪或已关闭启动同步，跳过实时同步');
  }

  const win = await createMainWindow();
  registerGlobalShortcuts(win);
});

app.on('window-all-closed', () => {
  unregisterGlobalShortcuts();
  closeDatabase();
  if (localServiceProcess && !localServiceProcess.killed) {
    console.log('[LocalService] 正在关闭本地数据服务...');
    localServiceProcess.kill();
  }
  app.quit();
});

app.on('activate', async () => {
  if (mainWindow === null) {
    const win = await createMainWindow();
    registerGlobalShortcuts(win);
  }
});
