import * as cheerio from 'cheerio';
import http from 'http';
import https from 'https';
import iconv from 'iconv-lite';

export interface BookSourceConfig {
  bookSourceUrl: string;
  bookSourceName: string;
  bookSourceGroup?: string;
  bookSourceType?: number;
  bookUrlPattern?: string;
  charset?: string;
  header?: string;
  enabledCookieJar?: boolean;
  ruleSearch?: Record<string, string>;
  ruleBookInfo?: Record<string, string>;
  ruleToc?: Record<string, string>;
  ruleContent?: Record<string, string>;
  [key: string]: any;
}

export interface SearchBook {
  name: string;
  author: string;
  coverUrl: string;
  intro: string;
  bookUrl: string;
}

export interface ExploreCategory {
  title: string;
  url: string;
}

export interface Chapter {
  title: string;
  url: string;
}

export interface BookDetail {
  name: string;
  author: string;
  intro: string;
  coverUrl: string;
  tocUrl: string;
}

// Simple cookie jar shared within this process
const cookieJar = new Map<string, string>();

// In-memory cache for explore categories and category books
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const categoryCache = new Map<string, CacheEntry<ExploreCategory[]>>();
const categoryBookCache = new Map<string, CacheEntry<SearchBook[]>>();

function getCacheKey(source: BookSourceConfig, ...parts: (string | number)[]): string {
  return [source.bookSourceUrl, source.bookSourceName, ...parts].join('|');
}

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

function parseCharset(source: BookSourceConfig, contentType: string, htmlBuffer?: Buffer): string {
  // 1. Explicit source charset
  if (source.charset) {
    const c = source.charset.toLowerCase();
    if (c === 'gbk' || c === 'gb2312' || c === 'gb18030') return 'gbk';
    return c;
  }
  // 2. Content-Type header
  const ctMatch = contentType.match(/charset=([\w-]+)/i);
  if (ctMatch) {
    const c = ctMatch[1].toLowerCase();
    if (c === 'gbk' || c === 'gb2312' || c === 'gb18030') return 'gbk';
    return c;
  }
  // 3. Meta charset in HTML
  if (htmlBuffer) {
    const sample = htmlBuffer.slice(0, 4096).toString('binary');
    const metaMatch = sample.match(/<meta[^>]+charset=["']?([\w-]+)/i);
    if (metaMatch) {
      const c = metaMatch[1].toLowerCase();
      if (c === 'gbk' || c === 'gb2312' || c === 'gb18030') return 'gbk';
      return c;
    }
  }
  return 'utf-8';
}

function parseHeaders(source: BookSourceConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 9) Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  };
  if (source.header) {
    try {
      const parsed = JSON.parse(source.header);
      Object.assign(headers, parsed);
    } catch {
      // ignore invalid header JSON
    }
  }
  return headers;
}

function getCookieForUrl(url: string): string | undefined {
  const host = new URL(url).host;
  const jar = cookieJar.get(host);
  return jar || undefined;
}

function setCookieForUrl(url: string, setCookieHeader: string | string[] | undefined): void {
  if (!setCookieHeader) return;
  const host = new URL(url).host;
  const parts = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const cookies: string[] = [];
  for (const part of parts) {
    const cookie = part.split(';')[0].trim();
    if (cookie) cookies.push(cookie);
  }
  if (cookies.length > 0) {
    cookieJar.set(host, cookies.join('; '));
  }
}

function fetchText(url: string, source?: BookSourceConfig, timeout = 20000): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const headers = source ? parseHeaders(source) : parseHeaders({} as BookSourceConfig);
    if (source?.enabledCookieJar) {
      const cookie = getCookieForUrl(url);
      if (cookie) headers['Cookie'] = cookie;
    }

    const req = client.get(url, { timeout, headers }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(resolveRelativeUrl(url, res.headers.location), source, timeout).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      if (source?.enabledCookieJar) {
        setCookieForUrl(url, res.headers['set-cookie']);
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const charset = parseCharset(source || {} as BookSourceConfig, res.headers['content-type'] || '', buffer);
        try {
          const text = iconv.decode(buffer, charset);
          resolve(text);
        } catch {
          resolve(buffer.toString('utf-8'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
  });
}

function resolveRelativeUrl(base: string, relative: string): string {
  if (!relative) return base;
  if (/^https?:\/\//i.test(relative)) return relative;
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

function fillUrlTemplate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => encodeURIComponent(String(params[key] ?? '')));
}

function applyReplace(value: string, rule: string): string {
  if (!rule) return value;
  // Legado replace rule: pattern##replacement (default replacement is empty)
  // or @@ as separator
  const sep = rule.includes('##') ? '##' : '@@';
  const parts = rule.split(sep);
  const pattern = parts[0];
  const replacement = parts[1] || '';
  if (!pattern) return value;
  try {
    return value.replace(new RegExp(pattern, 'g'), replacement).trim();
  } catch {
    return value;
  }
}

function convertLegadoSelector(raw: string): string {
  if (!raw) return raw;
  // class.xxx -> .xxx
  if (raw.startsWith('class.')) return '.' + raw.slice(6);
  // id.xxx -> #xxx
  if (raw.startsWith('id.')) return '#' + raw.slice(3);
  // tag.xxx -> xxx
  if (raw.startsWith('tag.')) return raw.slice(4);
  // text.xxx -> :contains("xxx")
  if (raw.startsWith('text.')) return `:contains("${raw.slice(5)}")`;
  // tag.number e.g. a.0 -> a:eq(0)
  const tagNumMatch = raw.match(/^([a-zA-Z][a-zA-Z0-9]*)\.(\d+)$/);
  if (tagNumMatch) return `${tagNumMatch[1]}:eq(${tagNumMatch[2]})`;
  return raw;
}

function selectElements($: cheerio.CheerioAPI, selector: string, baseUrl: string): cheerio.Cheerio<any> {
  if (!selector) return $($.root()) as any;
  const converted = convertLegadoSelector(selector);
  // Support :eq(n) like some sources
  const eqMatch = converted.match(/:eq\((\d+)\)$/);
  if (eqMatch) {
    const clean = converted.slice(0, converted.lastIndexOf(':eq('));
    const idx = parseInt(eqMatch[1], 10);
    return $(clean).eq(idx);
  }
  return $(converted);
}

function safeQuery($: cheerio.CheerioAPI, selector: string): cheerio.Cheerio<any> | null {
  if (!selector) return null;
  const converted = convertLegadoSelector(selector);
  try {
    return $(converted);
  } catch {
    return null;
  }
}

function extractField($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>, rule: string, baseUrl: string): string {
  if (!rule) return '';
  try {
    // Split rule by @, but the last segment may contain ## or @@ replace rules
    const atParts = rule.split('@');
    let attrSegment = atParts[atParts.length - 1] || 'text';
    let replaceRule = '';

    // Check for replace rule inside attr segment: text##pattern##replacement or text@@pattern@@replacement
    for (const sep of ['##', '@@']) {
      if (attrSegment.includes(sep)) {
        const idx = attrSegment.indexOf(sep);
        replaceRule = attrSegment.slice(idx + sep.length);
        attrSegment = attrSegment.slice(0, idx);
        break;
      }
    }

    const attr = attrSegment || 'text';
    const selectorChain = atParts.slice(0, -1).map(convertLegadoSelector).filter(Boolean);

    let target = el;
    if (selectorChain.length > 0) {
      // First selector: check self match then find
      const firstSel = selectorChain[0];
      const selfMatch = el.filter(firstSel);
      target = selfMatch.length > 0 ? selfMatch : el.find(firstSel);
      // Subsequent selectors: find within current target
      for (let i = 1; i < selectorChain.length; i++) {
        target = target.find(selectorChain[i]);
      }
    }

    let value = '';
    if (attr === 'text') {
      value = target.text().trim();
    } else if (attr === 'textNodes') {
      value = target.contents()
        .filter(function () { return this.type === 'text'; })
        .map(function () { return (this as any).data; })
        .get()
        .join('\n')
        .trim();
    } else if (attr === 'html') {
      value = target.html() || '';
    } else {
      value = target.attr(attr) || '';
    }

    if (replaceRule) {
      value = applyReplace(value, replaceRule);
    }

    if (['href', 'src', 'bookUrl', 'chapterUrl', 'tocUrl'].some((k) => attr.toLowerCase().includes(k)) && value) {
      value = resolveRelativeUrl(baseUrl, value);
    }

    return value;
  } catch (err) {
    console.warn(`[bookSourceEngine] extractField error for rule "${rule}":`, err instanceof Error ? err.message : String(err));
    return '';
  }
}

async function extractSearchBooks(source: BookSourceConfig, rule: Record<string, string>, baseUrl: string, html: string): Promise<SearchBook[]> {
  const $ = cheerio.load(html);
  const listSelector = rule.bookList;
  if (!listSelector) return [];

  const list = safeQuery($, listSelector);
  if (!list) return [];

  const items = list.toArray();
  const results: SearchBook[] = [];
  for (const item of items.slice(0, 30)) {
    const $item = $(item);
    const name = extractField($, $item, rule.name || '.title@text', baseUrl);
    const author = extractField($, $item, rule.author || '.author@text', baseUrl);
    const coverUrl = extractField($, $item, rule.coverUrl || 'img@src', baseUrl);
    const intro = extractField($, $item, rule.intro || '.intro@text', baseUrl);
    const bookUrl = extractField($, $item, rule.bookUrl || 'a@href', baseUrl);
    if (!name || !bookUrl) continue;
    results.push({ name, author, coverUrl, intro, bookUrl });
  }
  return results;
}

export async function searchBySource(source: BookSourceConfig, keyword: string): Promise<SearchBook[]> {
  const rule = source.ruleSearch || {};
  if (!rule.url || !rule.bookList) return [];

  const searchUrl = fillUrlTemplate(rule.url, { key: keyword, page: 1 });
  const html = await fetchText(searchUrl, source);
  return extractSearchBooks(source, rule, searchUrl, html);
}

export function parseExploreUrl(exploreUrl: string): ExploreCategory[] {
  if (!exploreUrl || exploreUrl.trim() === '') return [];
  try {
    const parsed = JSON.parse(exploreUrl);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list
      .filter((item: any) => item && typeof item === 'object' && item.title && item.url && item.url.trim() !== '')
      .map((item: any) => ({ title: String(item.title).trim(), url: String(item.url).trim() }));
  } catch {
    return [];
  }
}

export async function exploreBySource(source: BookSourceConfig): Promise<{ title: string; books: SearchBook[] }[]> {
  const explore = source.ruleExplore || source.ruleFind || source.ruleDiscover;
  const out: { title: string; books: SearchBook[] }[] = [];

  // ruleExplore can be an array of blocks or a single block
  if (explore) {
    const blocks = Array.isArray(explore) ? explore : [explore];
    for (const block of blocks) {
      if (!block.url || !block.bookList) continue;
      const exploreUrl = fillUrlTemplate(block.url, { page: 1 });
      try {
        const html = await fetchText(exploreUrl, source);
        const books = await extractSearchBooks(source, block, exploreUrl, html);
        if (books.length > 0) {
          out.push({ title: block.title || source.bookSourceName || '推荐', books });
        }
      } catch {
        // ignore single block failure
      }
    }
  }

  // Fallback: if no explore rule or no results, try search with hot keywords
  if (out.length === 0) {
    const searchRule = source.ruleSearch;
    if (searchRule?.url && searchRule?.bookList) {
      const hotKeywords = ['', '热门', '排行', '推荐'];
      for (const kw of hotKeywords) {
        try {
          const searchUrl = fillUrlTemplate(searchRule.url, { key: kw, page: 1 });
          const html = await fetchText(searchUrl, source);
          const books = await extractSearchBooks(source, searchRule, searchUrl, html);
          if (books.length > 0) {
            out.push({ title: kw || '热门推荐', books });
            break;
          }
        } catch {
          // try next keyword
        }
      }
    }
  }

  return out;
}

export async function getExploreCategories(source: BookSourceConfig): Promise<ExploreCategory[]> {
  const cacheKey = getCacheKey(source, 'categories');
  const cached = getCached(categoryCache, cacheKey);
  if (cached) return cached;

  // Prefer explicit exploreUrl array (common in reader app sources)
  const fromExploreUrl = parseExploreUrl(source.exploreUrl);
  if (fromExploreUrl.length > 0) {
    setCached(categoryCache, cacheKey, fromExploreUrl);
    return fromExploreUrl;
  }

  // Fallback to ruleExplore blocks
  const explore = source.ruleExplore || source.ruleFind || source.ruleDiscover;
  if (!explore) return [];
  const blocks = Array.isArray(explore) ? explore : [explore];
  const result = blocks
    .filter((block: any) => block && block.url && block.title)
    .map((block: any) => ({ title: String(block.title).trim(), url: String(block.url).trim() }));
  setCached(categoryCache, cacheKey, result);
  return result;
}

function looksLikeBookUrl(url: string, pattern?: string): boolean {
  if (!url) return false;
  if (pattern) {
    try {
      return new RegExp(pattern).test(url);
    } catch {
      // ignore invalid regex
    }
  }
  // Exclude obvious non-book URLs
  const nonBookPatterns = [
    /\/(category|top|rank|list|sort|tag|author|search|login|register|index)\//i,
    /\/(\d+\/)?\d+\.html\?/i,
    /javascript:/i,
    /#$/,
  ];
  if (nonBookPatterns.some((p) => p.test(url))) return false;

  // Common book detail URL patterns for Chinese novel sites
  return /\/(book|novel|biquge|read|files|article|xs|b|n)\/\d+/i.test(url) ||
         /\/(\d+[/_-]?\d*\.html?)$/i.test(url) ||
         /\/\d+[/_-]\d+\/?$/i.test(url) ||
         /\/\d{3,}\/?$/i.test(url);
}

function looksLikeBookName(name: string): boolean {
  const cleaned = name.trim();
  if (cleaned.length < 2 || cleaned.length > 35) return false;
  // Filter out navigation / menu text
  const blacklist = ['首页', '分类', '排行', '完本', '书架', '阅读', '登录', '注册', '下一页', '上一页', '笔趣阁'];
  if (blacklist.some((w) => cleaned.includes(w))) return false;
  return true;
}

async function getCategoryBooksSinglePage(source: BookSourceConfig, categoryUrl: string, page = 1, timeout = 20000): Promise<SearchBook[]> {
  const rule = source.ruleSearch || {};
  const baseUrl = source.bookSourceUrl || '';
  const url = resolveRelativeUrl(baseUrl, fillUrlTemplate(categoryUrl, { page }));
  const html = await fetchText(url, source, timeout);

  // 1. Try explicit search rule if available
  if (rule.bookList) {
    const books = await extractSearchBooks(source, rule, url, html);
    if (books.length > 0) return books;
  }

  // 2. Try common category list selectors
  const $ = cheerio.load(html);
  const candidateSelectors = [
    '.book-item',
    '.novel-item',
    '.list-item',
    'table.grid tr',
    'table tr',
    '.novelslist li',
    '.l li',
    '.top li',
    '#main li',
    'li',
  ];

  for (const selector of candidateSelectors) {
    const list = safeQuery($, selector);
    if (!list) continue;
    const items = list.toArray();
    if (items.length === 0) continue;
    const books: SearchBook[] = [];
    for (const item of items) {
      const $item = $(item);
      const link = $item.find('a').first();
      const name = link.text().trim() || $item.find('.s2 a, .bookname a, h2 a, h3 a, h4 a').first().text().trim();
      const href = resolveRelativeUrl(url, link.attr('href') || '');
      if (!name || !href) continue;
      if (!looksLikeBookName(name)) continue;
      if (!looksLikeBookUrl(href, source.bookUrlPattern)) continue;

      const author = $item.find('.author, .s4, .authorname, [class*="author"]').first().text().trim();
      const intro = $item.find('.intro, .des, .summary, [class*="intro"]').first().text().trim();
      const coverUrl = resolveRelativeUrl(url, $item.find('img').first().attr('src') || '');
      books.push({ name, author, coverUrl, intro, bookUrl: href });
    }
    if (books.length >= 3) return books;
  }

  // 3. Last resort: scan all links that look like book links
  const fallback: SearchBook[] = [];
  $('a').each((_i, el) => {
    const $el = $(el);
    const name = $el.text().trim();
    const href = resolveRelativeUrl(url, $el.attr('href') || '');
    if (!name || !href) return;
    if (!looksLikeBookName(name)) return;
    if (href === url || href === url.replace(/\.html?$/i, '/') || href + '.html' === url) return;
    if (!looksLikeBookUrl(href, source.bookUrlPattern)) return;
    if (fallback.some((b) => b.bookUrl === href)) return;
    fallback.push({ name, author: '', coverUrl: '', intro: '', bookUrl: href });
  });

  // 4. Ultra fallback: on a category page, most plain links are books
  if (fallback.length === 0) {
    const nonBookKeywords = /category|top|rank|list|sort|tag|author|search|login|register|index|page|home|about|contact/;
    $('a').each((_i, el) => {
      const $el = $(el);
      const name = $el.text().trim();
      const href = resolveRelativeUrl(url, $el.attr('href') || '');
      if (!name || !href) return;
      if (!looksLikeBookName(name)) return;
      if (href === url || href.replace(/\.html?$/i, '/') === url.replace(/\.html?$/i, '/')) return;
      if (nonBookKeywords.test(href.toLowerCase())) return;
      if (fallback.some((b) => b.bookUrl === href)) return;
      fallback.push({ name, author: '', coverUrl: '', intro: '', bookUrl: href });
    });
  }

  return fallback;
}

export async function getCategoryBooks(
  source: BookSourceConfig,
  categoryUrl: string,
  page = 1,
  pageSize = 30
): Promise<SearchBook[]> {
  const cacheKey = getCacheKey(source, 'category-books', categoryUrl, page, pageSize);
  const cached = getCached(categoryBookCache, cacheKey);
  if (cached) return cached;

  const targetCount = Math.max(pageSize, 1);
  // Most book-source category pages return ~20 books per page.
  // Aggregate enough source pages in one block so the UI can be filled.
  const booksPerSourcePage = 20;
  const pagesPerBlock = Math.max(1, Math.ceil(targetCount / booksPerSourcePage));
  const startSourcePage = (page - 1) * pagesPerBlock + 1;
  const endSourcePage = startSourcePage + pagesPerBlock - 1;

  const results: SearchBook[] = [];
  try {
    const pages = Array.from({ length: endSourcePage - startSourcePage + 1 }, (_, i) => startSourcePage + i);
    const batchResults = await Promise.all(
      pages.map((p) => getCategoryBooksSinglePage(source, categoryUrl, p, 10000).catch(() => []))
    );

    for (const books of batchResults) {
      for (const book of books) {
        if (!results.some((b) => b.bookUrl === book.bookUrl)) {
          results.push(book);
        }
      }
    }
  } catch (err) {
    console.error('[bookSourceEngine] getCategoryBooks error:', err instanceof Error ? err.message : String(err));
  }

  const result = results.slice(0, targetCount);
  setCached(categoryBookCache, cacheKey, result);
  return result;
}

export async function searchAllSources(sources: BookSourceConfig[], keyword: string): Promise<{ sourceName: string; sourceId?: number; books: SearchBook[] }[]> {
  const results: { sourceName: string; sourceId?: number; books: SearchBook[] }[] = [];
  await Promise.all(
    sources.map(async (source) => {
      try {
        const books = await searchBySource(source, keyword);
        if (books.length > 0) {
          results.push({ sourceName: source.bookSourceName, books });
        }
      } catch {
        // ignore
      }
    })
  );
  return results;
}

export async function getBookDetail(source: BookSourceConfig, bookUrl: string): Promise<BookDetail> {
  const rule = source.ruleBookInfo || {};
  const html = await fetchText(bookUrl, source);
  const $ = cheerio.load(html);
  const baseUrl = bookUrl;

  let name = extractField($, $('body') as any, rule.name || '', baseUrl);
  if (!name) {
    const candidates = ['h1', 'h2', '.bookname', '.title', '.name', '#title', 'title'];
    for (const sel of candidates) {
      const text = $(sel).first().text().trim();
      if (text && text.length < 60) {
        name = text;
        break;
      }
    }
  }

  let author = extractField($, $('body') as any, rule.author || '', baseUrl);
  if (!author) {
    const text = $('.author, [class*="author"], [class*="writer"]').first().text().trim();
    if (text) author = text.replace(/^作者[：:]?\s*/, '');
  }

  let intro = extractField($, $('body') as any, rule.intro || '', baseUrl);
  if (!intro) {
    intro = $('.intro, .description, .summary, [class*="intro"], [class*="desc"]').first().text().trim();
  }

  let coverUrl = extractField($, $('body') as any, rule.coverUrl || '', baseUrl);
  if (!coverUrl) {
    const img = $('.cover img, .bookimg img, img[src*="cover"]').first().attr('src');
    if (img) coverUrl = resolveRelativeUrl(baseUrl, img);
  }

  let tocUrl = extractField($, $('body') as any, rule.tocUrl || '', baseUrl);
  if (!tocUrl) {
    const readLink = $('.read, [class*="read"], a[href*="read"], a[href*="list"]').first().attr('href');
    if (readLink) tocUrl = resolveRelativeUrl(baseUrl, readLink);
  }
  if (!tocUrl) tocUrl = bookUrl;

  return { name, author, intro, coverUrl, tocUrl };
}

export async function getChapterList(source: BookSourceConfig, tocUrl: string): Promise<Chapter[]> {
  const rule = source.ruleToc || {};

  const html = await fetchText(tocUrl, source);
  const $ = cheerio.load(html);
  const baseUrl = tocUrl;

  const candidateSelectors = rule.chapterList
    ? [rule.chapterList]
    : [
        '#list dd a', '#list dt a',
        '.chapterlist li a', '.chapter-list li a', '.chapterList li a',
        '#mlist li a', '.catalog li a', '.mulu li a',
        '.chapter-item a', '.chapterItem a', '.chapter a',
        '#chapterlist a', '#chapterList a', '#readerlists a',
        'dl a', '.panel-body a', '.list-group a',
        '.ccss a', '#xsdsxscsaa a', '#xsdsxscsa a',
        'a[href*="read"]', 'a[href*="chapter"]',
      ];

  for (const selector of candidateSelectors) {
    const list = safeQuery($, selector);
    if (!list) continue;
    const items = list.toArray();
    const chapters: Chapter[] = [];
    for (const item of items) {
      const $item = $(item);
      const title = extractField($, $item, rule.chapterName || 'a@text', baseUrl);
      const url = extractField($, $item, rule.chapterUrl || 'a@href', baseUrl);
      if (!title || !url) continue;
      chapters.push({ title, url });
    }
    if (chapters.length > 0) return chapters.slice(0, 500);
  }
  return [];
}

export async function getChapterContent(source: BookSourceConfig, chapterUrl: string): Promise<string> {
  const rule = source.ruleContent || {};

  const html = await fetchText(chapterUrl, source);
  const $ = cheerio.load(html);
  const baseUrl = chapterUrl;

  // 1. Prefer explicit ruleContent.content (Legado rule like "id.txt@html")
  if (rule.content) {
    const content = extractField($, $('body') as any, rule.content, baseUrl);
    if (content && content.length > 50) {
      return cleanChapterContent(content);
    }
  }

  // 2. Try common content selectors
  const candidateSelectors = [
    '#content', '.content', '#chaptercontent', '.chapter-content',
    '#txt', '.read-content', '.showtxt', '#TextContent', '.article-content',
    '#BookText', '.booktext', '.read_t', '.yuedu_zhengwen',
    '.chapter-content', '.chapter_content', '.chapter-text',
    '.reader-main', '.reader-main-content', '.nr_nr', '.read_main',
  ];

  for (const selector of candidateSelectors) {
    const el = safeQuery($, selector);
    if (!el || el.length === 0) continue;
    const content = el.first().text().trim();
    if (content && content.length > 200) {
      return cleanChapterContent(content);
    }
  }

  // 3. Fallback: find the largest <div> that looks like chapter text
  //    Exclude nav/header/footer elements and very large containers (likely body wrapper)
  let bestText = '';
  let bestEl: any = null;
  $('div, article, section').each((_i, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    if (text.length < 300) return;
    if (text.length > bestText.length && text.length < html.length * 0.6) {
      bestText = text;
      bestEl = $el;
    }
  });

  if (bestEl) {
    return cleanChapterContent(bestEl.text().trim());
  }
  return '';
}

function cleanChapterContent(content: string): string {
  if (!content) return '';
  return content
    .replace(/(<br\s*\/?>)/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .replace(/^\s+|\s+$/g, '')
    .replace(/欢迎来到.*小说网|最快更新.*无广告|天才一秒.*|请记住本书.*|手机阅读.*|\(.*www\..*\)/gi, '');
}

export function parseBookSource(raw: string): BookSourceConfig | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed[0] as BookSourceConfig;
    return parsed as BookSourceConfig;
  } catch {
    return null;
  }
}
