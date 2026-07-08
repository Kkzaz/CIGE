import path from 'path';
import fs from 'fs';
import type { Database } from 'better-sqlite3';
import { LOCAL_SERVICE_PORT, fetchJsonFromLocalService } from './rhymeServer';

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

export async function syncHotTrendsToInspirations(db: Database): Promise<void> {
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

export async function syncQuotesToInspirations(db: Database): Promise<void> {
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

export async function syncMoreHotTrendsToInspirations(db: Database, targetMin: number = 50): Promise<number> {
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

export async function syncMoreQuotesToInspirations(db: Database, targetMin: number = 50): Promise<number> {
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
