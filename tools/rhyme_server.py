#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地韵脚查询服务
- 本地 JSON 缓存优先
- 搜韵 API (sou-yun.cn) 作为第一在线源：RhymeDictionary 接口可拿到词末押韵词和例句
- 完美韵脚网页解析 (wanmeiyunjiao.com) 作为备用
- 反爬：浏览器 User-Agent、请求间隔 >= 1s

运行：python tools/rhyme_server.py
接口：GET http://127.0.0.1:8792/rhyme?char=花
返回：{
  "char": "花",
  "source": "souyun",
  "final": "麻",
  "characters": ["华", "家", "涯", ...],
  "words": ["天涯", "年华", "落花", ...],
  "examples": ["春风桃李花开夜，秋雨梧桐叶落时。", ...],
  "from_cache": false
}
"""

import os
import json
import time
import urllib.request
import urllib.parse
import urllib.error
import ssl
import concurrent.futures
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# 项目根目录
cige_root = Path(__file__).resolve().parent.parent
cache_dir = cige_root / "tools" / "rhyme_cache"
cache_dir.mkdir(parents=True, exist_ok=True)
hot_trends_cache_file = cige_root / "tools" / "hot_trends_cache.json"

last_request_time = 0.0
min_interval = 1.0  # 最小请求间隔（秒）

# 抖音、小红书等公开接口需要 TLS，部分环境证书可能有问题，使用兼容 context
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
}


def _polite_delay():
    """每次网络请求前确保间隔 >=1s，避免给对方服务器造成压力。"""
    global last_request_time
    now = time.time()
    elapsed = now - last_request_time
    if elapsed < min_interval:
        time.sleep(min_interval - elapsed)
    last_request_time = time.time()


def cache_path(char: str) -> Path:
    return cache_dir / f"{urllib.parse.quote(char, safe='')}.json"


def load_cache(char: str):
    p = cache_path(char)
    if p.exists():
        try:
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None


def save_cache(char: str, data: dict):
    p = cache_path(char)
    try:
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[WARN] 缓存写入失败 {char}: {e}")


def fetch_souyun(char: str):
    """调用搜韵「韵典接口」，获取同韵字、词末押韵词、例句。"""
    url = f"https://api.sou-yun.cn/open/RhymeDictionary?id={urllib.parse.quote(char)}"
    _polite_delay()
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None

        # 从 RhymeCategory 获取同韵单字
        final = ""
        category = data.get("RhymeCategory", "")
        if category:
            # 如 "东韵平声" 取 "东"
            final = category[0] if category else ""

        # 词末押韵词（Sufwords）最贴近歌词句末押韵
        words = [w for w in data.get("Sufwords", []) if isinstance(w, str) and w]
        # 词首词也作为词语联想
        pre_words = [w for w in data.get("Prewords", []) if isinstance(w, str) and w]
        words = list(dict.fromkeys(words + pre_words))

        # 例句：取以该字结尾的诗句，最多 20 句
        examples = []
        for item in data.get("SentenceExamples", []):
            sentence = item.get("Sentence", "") if isinstance(item, dict) else ""
            if sentence:
                examples.append(sentence)
        examples = examples[:20]

        # 同韵单字：再查一次 RhymeCategory 获得同一韵部的所有字
        chars = []
        if final:
            chars = fetch_souyun_category(final, char)

        return {
            "source": "souyun",
            "final": final,
            "characters": chars,
            "words": words,
            "examples": examples,
        }
    except Exception as e:
        print(f"[WARN] 搜韵韵典请求失败 {char}: {e}")
        return None


def fetch_souyun_category(final: str, exclude_char: str = ""):
    """查询平水韵某一韵部下的所有字。"""
    url = f"https://api.sou-yun.cn/open/RhymeCategory?id={urllib.parse.quote(final)}"
    _polite_delay()
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
        data = json.loads(raw)
        chars = []
        if isinstance(data, dict):
            for item in data.get("Chars", []):
                if isinstance(item, dict) and "Character" in item:
                    c = item["Character"]
                    if c != exclude_char:
                        chars.append(c)
        return chars
    except Exception as e:
        print(f"[WARN] 搜韵韵目请求失败 {final}: {e}")
        return []


# 完美韵脚需要复用 cookie，因此用 opener 维护会话
_wanmei_opener = None


def _get_wanmei_opener():
    global _wanmei_opener
    if _wanmei_opener is None:
        cj = urllib.request.HTTPCookieProcessor()
        _wanmei_opener = urllib.request.build_opener(cj)
    return _wanmei_opener


def fetch_wanmei(char: str):
    """解析完美韵脚搜索结果页（第一优先源）。"""
    import re

    base_url = "http://www.wanmeiyunjiao.com/rhyme"
    opener = _get_wanmei_opener()

    try:
        # 1. 先 GET 页面获取 csrf token 和 cookie
        _polite_delay()
        req = urllib.request.Request(base_url, headers=headers)
        html = opener.open(req, timeout=15).read().decode("utf-8", errors="ignore")
        csrf_match = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', html)
        if not csrf_match:
            print(f"[WARN] 完美韵脚未获取到 csrf token {char}")
            return None
        csrf = csrf_match.group(1)

        # 2. POST 搜索
        data = urllib.parse.urlencode({
            "csrfmiddlewaretoken": csrf,
            "search": char,
            "exact_search": "押一下",
        }).encode("utf-8")
        req2 = urllib.request.Request(base_url, data=data, headers={
            **headers,
            "Referer": base_url,
            "Content-Type": "application/x-www-form-urlencoded",
        })
        html2 = opener.open(req2, timeout=15).read().decode("utf-8", errors="ignore")

        # 3. 解析同韵单字（query_res2）
        characters = []
        m2 = re.search(r'<div[^>]*class="query_res2"[^>]*>(.*?)</div>', html2, re.S)
        if m2:
            # 去掉标题 <p>词典的检索结果</p>
            text = re.sub(r'<p>.*?</p>', '', m2.group(1), flags=re.S)
            text = re.sub(r'<[^>]+>', '', text)
            text = text.replace('&nbsp;', ' ')
            characters = [c for c in text if "\u4e00" <= c <= "\u9fff" and c != char]

        # 4. 从 /rhyme 的歌曲检索结果里收集同韵单字和歌词例句（这些例句来自其他同韵字）
        rhyme_page_words = []
        lyric_examples = []
        m1 = re.search(r'<div[^>]*class="query_res"[^>]*>(.*?)</div>', html2, re.S)
        if m1:
            rows = re.findall(r'<tr>(.*?)</tr>', m1.group(1), re.S)
            for row in rows[1:]:  # 跳过表头
                cols = re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)
                if len(cols) >= 4:
                    lyric_word = re.sub(r'<[^>]+>', '', cols[2]).strip()
                    line = re.sub(r'<[^>]+>', '', cols[3]).strip()
                    if not lyric_word or not line:
                        continue
                    if lyric_word != char and lyric_word not in rhyme_page_words:
                        rhyme_page_words.append(lyric_word)
                    if line and len(line) > 3 and line not in lyric_examples:
                        lyric_examples.append(line)

        # 5. 访问 word_detail 页面，拿到大量包含当前字的歌词行，从中提取多字词组
        words = []
        _polite_delay()
        word_detail_url = f"http://www.wanmeiyunjiao.com/word_detail?word={urllib.parse.quote(char)}"
        req_wd = urllib.request.Request(word_detail_url, headers={**headers, "Referer": base_url})
        wd_html = opener.open(req_wd, timeout=30).read().decode("utf-8", errors="ignore")

        wd_lyric_examples = []
        wd_rows = re.findall(r'<tr>(.*?)</tr>', wd_html, re.S)
        for row in wd_rows[1:]:  # 跳过表头
            cols = re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)
            if len(cols) >= 4:
                line = re.sub(r'<[^>]+>', '', cols[3]).strip()
                if not line or len(line) <= 3 or line.lower() == 'line_lyric':
                    continue
                if line not in wd_lyric_examples:
                    wd_lyric_examples.append(line)
                # 从句末提取包含当前字的词组（1~15 字）
                idx = line.rfind(char)
                if idx >= 0:
                    for n in range(0, 15):
                        start = max(0, idx - n)
                        phrase = line[start:idx + len(char)]
                        if phrase and phrase != char and phrase not in words:
                            words.append(phrase)
            if len(wd_lyric_examples) >= 500:
                break

        # 把 /rhyme 页面得到的同韵单字也加入 words
        for w in rhyme_page_words:
            if w not in words:
                words.append(w)

        # 6. 解析例句：诗歌检索结果中的诗句，并混入歌词例句
        poetry_examples = []
        m3 = re.search(r'<div[^>]*class="query_res3"[^>]*>(.*?)</div>', html2, re.S)
        if m3:
            # 按 <tr> 拆分，每行取第 4 个 <td>
            rows = re.findall(r'<tr>(.*?)</tr>', m3.group(1), re.S)
            for row in rows[1:]:  # 跳过表头
                cols = re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)
                if len(cols) >= 4:
                    line = re.sub(r'<[^>]+>', '', cols[3]).strip()
                    if line and len(line) > 3 and line not in poetry_examples:
                        poetry_examples.append(line)
        examples = (wd_lyric_examples[:15] + lyric_examples[:5] + poetry_examples[:10])

        if not characters and not words:
            return None

        return {
            "source": "wanmei",
            "final": "",
            "characters": characters,
            "words": words,
            "examples": examples,
        }
    except Exception as e:
        print(f"[WARN] 完美韵脚请求失败 {char}: {e}")
        return None


def query(char: str, source: str = "auto"):
    """完整查询流程：按 source 选择数据源。"""
    # 按来源分别缓存，避免不同来源互相覆盖
    cache_key = f"{char}:{source}" if source != "auto" else char
    cached = load_cache(cache_key)
    if cached:
        cached["from_cache"] = True
        return cached

    def try_save(res):
        res["char"] = char
        res["from_cache"] = False
        save_cache(cache_key, res)
        return res

    # 1. 完美韵脚
    if source in ("auto", "wanmei"):
        result = fetch_wanmei(char)
        if result and (result.get("characters") or result.get("words")):
            return try_save(result)
        if source == "wanmei":
            return try_save({
                "source": "wanmei",
                "final": "",
                "characters": [],
                "words": [],
                "examples": [],
            })

    # 2. 搜韵
    if source in ("auto", "souyun"):
        result = fetch_souyun(char)
        if result and (result.get("characters") or result.get("words")):
            return try_save(result)
        if source == "souyun":
            return try_save({
                "source": "souyun",
                "final": "",
                "characters": [],
                "words": [],
                "examples": [],
            })

    return {
        "char": char,
        "source": "none",
        "final": "",
        "characters": [],
        "words": [],
        "examples": [],
        "from_cache": False,
    }


# ==================== 热点热榜 ====================

def _http_get_json(url: str, extra_headers: dict = None):
    """通用 GET 请求，返回 JSON。"""
    req_headers = {**headers}
    if extra_headers:
        req_headers.update(extra_headers)
    req = urllib.request.Request(url, headers=req_headers)
    with urllib.request.urlopen(req, timeout=15, context=ssl_context) as res:
        return json.loads(res.read().decode("utf-8", errors="ignore"))


def _http_post_json(url: str, body: dict, extra_headers: dict = None):
    """通用 POST 请求，返回 JSON。"""
    req_headers = {
        **headers,
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
    }
    if extra_headers:
        req_headers.update(extra_headers)
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=req_headers, method="POST")
    with urllib.request.urlopen(req, timeout=30, context=ssl_context) as res:
        return json.loads(res.read().decode("utf-8", errors="ignore"))


def get_redfox_api_key():
    """从环境变量或本地文件读取红狐数据 API Key。"""
    env_key = os.environ.get("REDFOX_API_KEY", "").strip()
    if env_key:
        return env_key
    key_file = cige_root / "tools" / ".redfox_key"
    if key_file.exists():
        try:
            return key_file.read_text(encoding="utf-8").strip()
        except Exception:
            pass
    return ""


def fetch_douyin_hot():
    """抓取抖音实时热榜（douyin-hot-trend 使用的公开接口）。"""
    _polite_delay()
    url = "https://www.douyin.com/aweme/v1/hot/search/list/"
    extra = {
        "Accept": "application/json",
        "Referer": "https://www.douyin.com/",
    }
    data = _http_get_json(url, extra)
    word_list = data.get("data", {}).get("word_list", [])
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    result = []
    for item in word_list:
        result.append({
            "platform": "douyin",
            "rank": item.get("position") or len(result) + 1,
            "title": item.get("word", ""),
            "hot_value": item.get("hot_value", 0),
            "link": item.get("url") or f"https://www.douyin.com/search/{urllib.parse.quote(item.get('word', ''))}",
            "cover": item.get("word_cover", {}).get("url_list", [None])[0] if item.get("word_cover") else None,
            "label": str(item.get("label", "")),
            "fetched_at": now,
        })
    return result


def fetch_xiaohongshu_hot():
    """抓取小红书实时热搜（第三方公开接口 60s-api）。"""
    _polite_delay()
    url = "https://60s.viki.moe/v2/rednote"
    data = _http_get_json(url)
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    result = []
    for item in data.get("data", []):
        result.append({
            "platform": "xiaohongshu",
            "rank": item.get("rank", len(result) + 1),
            "title": item.get("title", ""),
            "hot_value": item.get("score", ""),
            "link": item.get("link", ""),
            "cover": item.get("work_type_icon") or None,
            "label": item.get("word_type", ""),
            "fetched_at": now,
        })
    return result


def fetch_redfox_hot(platform: str, keywords: list = None):
    """
    使用红狐数据 API 搜索热门关键词，返回高互动作品作为热点爆火文案。
    platform: douyin | xiaohongshu
    """
    api_key = get_redfox_api_key()
    if not api_key:
        raise RuntimeError("未配置 REDFOX_API_KEY 环境变量")

    api_headers = {
        "X-API-KEY": api_key,
        "Referer": "https://redfox.hk/apis",
        "Origin": "https://redfox.hk",
    }

    if platform == "douyin":
        url = "https://redfox.hk/story/api/dyData/searchArticle"
    elif platform == "xiaohongshu":
        url = "https://redfox.hk/story/api/xhsUser/searchArticle"
    else:
        raise ValueError(f"不支持的平台: {platform}")

    keywords = keywords or ["热点", "爆火", "热门", "热搜", "今天", "火了"]
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    seen = set()
    result = []

    for keyword in keywords:
        _polite_delay()
        try:
            data = _http_post_json(url, {"keyword": keyword, "offset": 0, "limit": 20}, api_headers)
            if data.get("code") != 2000:
                continue
            for idx, item in enumerate(data.get("data", {}).get("list", [])):
                if platform == "douyin":
                    title = item.get("title") or item.get("content", "")
                    hot = item.get("likeCount", 0) or item.get("commentCount", 0) or item.get("shareCount", 0)
                    link = item.get("workUrl", "")
                    cover = item.get("coverUrl", "")
                else:
                    title = item.get("workTitle") or item.get("workDesc", "")[:50]
                    hot = item.get("workLikedCount", 0) or item.get("workCommentsCount", 0) or item.get("workCollectedCount", 0)
                    link = item.get("workUrl", "")
                    cover = item.get("coverUrl", "")

                if not title or title in seen:
                    continue
                seen.add(title)
                result.append({
                    "platform": platform,
                    "rank": len(result) + 1,
                    "title": title,
                    "hot_value": hot,
                    "link": link,
                    "cover": cover,
                    "label": keyword,
                    "fetched_at": now,
                })
                if len(result) >= 50:
                    break
        except Exception as e:
            print(f"[WARN] 红狐 {platform} 关键词 '{keyword}' 搜索失败: {e}")
            continue
        if len(result) >= 50:
            break

    # 按热度倒序
    result.sort(key=lambda x: int(x.get("hot_value") or 0), reverse=True)
    for i, item in enumerate(result):
        item["rank"] = i + 1
    return result


def load_hot_trends_cache():
    """读取本地热榜缓存。"""
    if hot_trends_cache_file.exists():
        try:
            with open(hot_trends_cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[WARN] 热榜缓存读取失败: {e}")
    return {"data": [], "cached_at": None}


def save_hot_trends_cache(payload: dict):
    """写入本地热榜缓存。"""
    try:
        with open(hot_trends_cache_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[WARN] 热榜缓存写入失败: {e}")


def fetch_hot_trends(platforms=None, source="auto", skip_cache=False):
    """
    抓取指定平台的热榜/爆火文案，失败时自动 fallback 到本地缓存。
    platforms: list[str]，支持 douyin、xiaohongshu
    source: auto | redfox | public
        - auto:  优先红狐 API（配置 key 时），否则走公开接口
        - redfox: 强制使用红狐数据 API
        - public: 强制使用公开接口
    skip_cache: 是否忽略缓存强制重新获取（用于加载更多/刷新）
    """
    platforms = platforms or ["douyin", "xiaohongshu"]
    cache = load_hot_trends_cache() if not skip_cache else {}
    result_data = []
    used_cache = False
    has_redfox_key = bool(get_redfox_api_key())

    for platform in platforms:
        items = []
        try:
            if source == "redfox" or (source == "auto" and has_redfox_key):
                items = fetch_redfox_hot(platform)
                # 红狐返回空数据时（如积分不足），auto 模式下回退到公开接口
                if source == "auto" and not items:
                    raise RuntimeError("redfox 返回空数据，尝试公开接口")
            elif source == "public" or (source == "auto" and not has_redfox_key):
                if platform == "douyin":
                    items = fetch_douyin_hot()
                elif platform == "xiaohongshu":
                    items = fetch_xiaohongshu_hot()
                else:
                    continue
            else:
                continue
        except Exception as e:
            print(f"[WARN] {platform} 热榜抓取失败: {e}")
            if source == "auto":
                try:
                    if platform == "douyin":
                        items = fetch_douyin_hot()
                    elif platform == "xiaohongshu":
                        items = fetch_xiaohongshu_hot()
                except Exception as e2:
                    print(f"[WARN] {platform} 公开接口回退失败: {e2}")
            # 从缓存中找回该平台的历史数据
            if not items:
                cached_items = [i for i in cache.get("data", []) if i.get("platform") == platform]
                if cached_items:
                    items = cached_items
                    used_cache = True
        result_data.extend(items)

    # 如果所有平台都失败且没有任何数据，则返回整个缓存
    if not result_data and cache.get("data"):
        result_data = cache["data"]
        used_cache = True

    payload = {
        "success": True,
        "data": result_data,
        "count": len(result_data),
        "from_cache": used_cache,
        "source": "redfox" if (source == "redfox" or (source == "auto" and has_redfox_key)) else "public",
        "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    # 只要成功抓到任意平台的新数据，就刷新缓存
    if not used_cache or (used_cache and not cache.get("data")):
        save_hot_trends_cache(payload)

    return payload


# ==================== 金句/文案素材 ====================

quotes_cache_file = cige_root / "tools" / "quotes_cache.json"
quotes_cache_ttl = 600  # 金句缓存 10 分钟


def load_quotes_cache():
    """读取金句缓存。"""
    if not quotes_cache_file.exists():
        return None
    try:
        with open(quotes_cache_file, "r", encoding="utf-8") as f:
            cache = json.load(f)
        if time.time() - cache.get("cached_at", 0) < quotes_cache_ttl:
            return cache
    except Exception as e:
        print(f"[WARN] 金句缓存读取失败: {e}")
    return None


def save_quotes_cache(payload: dict):
    """写入金句缓存。"""
    payload["cached_at"] = time.time()
    try:
        with open(quotes_cache_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[WARN] 金句缓存写入失败: {e}")


_local_quotes_library: list = []


def load_local_quotes_library() -> list:
    """加载本地精选金句库。"""
    global _local_quotes_library
    if _local_quotes_library:
        return _local_quotes_library
    library_file = cige_root / "resources" / "quotes_library.json"
    if not library_file.exists():
        return []
    try:
        with open(library_file, "r", encoding="utf-8") as f:
            _local_quotes_library = json.load(f)
        print(f"[Quotes] 本地金句库已加载 {len(_local_quotes_library)} 条")
    except Exception as e:
        print(f"[WARN] 本地金句库加载失败: {e}")
        _local_quotes_library = []
    return _local_quotes_library


def fetch_hitokoto(count: int = 20):
    """从一言 API 并发获取文艺/动漫/影视/哲学短句。"""
    categories = ["a", "b", "d", "e", "h", "i", "j", "k", "l"]
    urls = [
        f"https://v1.hitokoto.cn/?c={categories[i % len(categories)]}&min_length=10&max_length=60"
        for i in range(count)
    ]
    now = time.strftime("%Y-%m-%d %H:%M:%S")

    def fetch_one(idx: int):
        try:
            data = _http_get_json(urls[idx])
            text = data.get("hitokoto", "").strip()
            if not text or len(text) < 10:
                return None
            return {
                "id": f"hitokoto-{data.get('uuid', idx)}",
                "platform": "hitokoto",
                "category": data.get("type", ""),
                "title": text,
                "content": text,
                "source": data.get("from", ""),
                "from_who": data.get("from_who", ""),
                "hot_value": "",
                "link": "",
                "cover": "",
                "label": "金句",
                "fetched_at": now,
            }
        except Exception as e:
            print(f"[WARN] 一言获取失败: {e}")
            return None

    result = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        for item in executor.map(fetch_one, range(len(urls))):
            if item:
                result.append(item)
    return result


def fetch_netease_comments(count: int = 20):
    """从公开接口并发获取网易云音乐热评。"""
    url = "https://v1.apizero.cn/api/netease-comment"
    now = time.strftime("%Y-%m-%d %H:%M:%S")

    def fetch_one(idx: int):
        try:
            data = _http_post_json(url, {})
            if data.get("code") != 0 and data.get("msg") != "成功":
                return None
            song = data.get("data", {}).get("song", {})
            comment = data.get("data", {}).get("comment", {})
            text = comment.get("content", "").strip()
            if not text or len(text) < 5:
                return None
            title = f"{song.get('title', '')} - {song.get('author', '')}".strip(" -")
            return {
                "id": f"netease-{hash(text) & 0x7fffffff}",
                "platform": "netease",
                "category": "热评",
                "title": title,
                "content": text,
                "source": title,
                "from_who": comment.get("nickname", ""),
                "hot_value": comment.get("liked_count", 0),
                "link": song.get("mp3_url", ""),
                "cover": song.get("image", ""),
                "label": "网易云热评",
                "fetched_at": now,
            }
        except Exception as e:
            print(f"[WARN] 网易云热评获取失败: {e}")
            return None

    result = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        for item in executor.map(fetch_one, range(count)):
            if item:
                result.append(item)
    return result


def fetch_quote_tags(limit: int = 20):
    """从小红书公开热榜中筛选带文案/金句/语录标签的内容。"""
    result = []
    keywords = ["文案", "金句", "语录"]
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    try:
        _polite_delay()
        data = _http_get_json("https://60s.viki.moe/v2/rednote")
        for item in data.get("data", []):
            title = item.get("title", "").strip()
            if not title:
                continue
            # 标题中包含文案相关关键词，或本身就是短句（长度适中）
            is_quote_tag = any(kw in title for kw in keywords)
            is_short_sentence = 10 <= len(title) <= 50 and not title.endswith("？") and not title.endswith("?")
            if not (is_quote_tag or is_short_sentence):
                continue
            result.append({
                "id": f"xhs-quote-{item.get('rank', len(result) + 1)}",
                "platform": "xiaohongshu",
                "category": item.get("word_type", ""),
                "title": title,
                "content": title,
                "source": "",
                "from_who": "",
                "hot_value": item.get("score", ""),
                "link": item.get("link", ""),
                "cover": item.get("work_type_icon") or None,
                "label": "文案标签",
                "fetched_at": now,
            })
            if len(result) >= limit:
                break
    except Exception as e:
        print(f"[WARN] 文案标签源获取失败: {e}")
    return result


def fetch_quotes(types: list = None, limit: int = 50, skip_cache: bool = False):
    """
    聚合金句/文案素材。
    types: list[str]，支持 hitokoto、netease
    skip_cache: 是否忽略缓存强制重新获取（用于加载更多）
    """
    types = types or ["hitokoto", "netease"]
    if not skip_cache:
        cache = load_quotes_cache()
        if cache and cache.get("types") == sorted(types) and cache.get("limit") == limit:
            return cache

    # 优先从本地精选金句库随机抽取，速度快且数量充足
    local_items = load_local_quotes_library()
    result = []
    if local_items:
        import random
        random.shuffle(local_items)
        for item in local_items[:limit]:
            result.append({
                "id": f"local-{hash(item.get('content', '')) & 0x7fffffff}",
                "platform": "local",
                "category": item.get("tags", "").split(",")[0] if item.get("tags") else "",
                "title": item.get("content", ""),
                "content": item.get("content", ""),
                "source": item.get("source", ""),
                "from_who": "",
                "hot_value": "",
                "link": "",
                "cover": "",
                "label": "精选",
                "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            })

    # 本地库不足时，再用一言/网易云补充
    shortfall = limit - len(result)
    if shortfall > 0 and "hitokoto" in types:
        try:
            result.extend(fetch_hitokoto(shortfall))
        except Exception as e:
            print(f"[WARN] 一言补充失败: {e}")

    # 按内容去重，限制返回数量
    seen = set()
    unique = []
    for item in result:
        text = item.get("content", "").strip()
        if text and text not in seen:
            seen.add(text)
            unique.append(item)
            if len(unique) >= limit:
                break

    payload = {
        "success": True,
        "data": unique,
        "count": len(unique),
        "types": sorted(types),
        "limit": limit,
        "from_cache": False,
        "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    save_quotes_cache(payload)
    return payload


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {self.address_string()} - {format % args}")

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/rhyme":
            char = params.get("char", [""])[0].strip()
            source = params.get("source", ["auto"])[0].strip().lower()
            if source not in ("auto", "wanmei", "souyun", "local"):
                source = "auto"
            if not char or len(char) != 1 or not ("\u4e00" <= char <= "\u9fff"):
                self._send_json({"error": "请输入单个汉字"}, status=400)
                return
            self._send_json(query(char, source))
            return

        if parsed.path == "/hot-trends":
            platforms = params.get("platforms", ["douyin,xiaohongshu"])[0].split(",")
            platforms = [p.strip().lower() for p in platforms if p.strip()]
            source = params.get("source", ["auto"])[0].strip().lower() or "auto"
            skip_cache = params.get("skip_cache", ["0"])[0].strip() in ("1", "true", "yes")
            self._send_json(fetch_hot_trends(platforms, source, skip_cache))
            return

        if parsed.path == "/quotes":
            qtypes = params.get("types", ["hitokoto,netease,tag"])[0].split(",")
            qtypes = [t.strip().lower() for t in qtypes if t.strip()]
            limit = int(params.get("limit", ["30"])[0])
            skip_cache = params.get("skip_cache", ["0"])[0].strip() in ("1", "true", "yes")
            self._send_json(fetch_quotes(qtypes, limit, skip_cache))
            return

        if parsed.path == "/":
            self._send_json({"msg": "CiGe 本地数据服务", "usage": "GET /rhyme?char=花  GET /hot-trends?platforms=douyin,xiaohongshu  GET /quotes?types=hitokoto,netease,tag&limit=30"})
            return

        self._send_json({"error": "Not Found"}, status=404)


if __name__ == "__main__":
    port = int(os.environ.get("CIGE_RHYME_PORT", "8792"))
    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"[CiGe] 韵脚服务已启动: http://127.0.0.1:{port}")
    print(f"[CiGe] 缓存目录: {cache_dir}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[CiGe] 正在关闭服务...")
        server.shutdown()
