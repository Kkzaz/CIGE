import json
import sqlite3
from pathlib import Path

cige_root = Path(__file__).resolve().parent.parent
cache_file = cige_root / "tools" / "quotes_cache.json"
db_file = cige_root / ".db" / "cige.db"

with open(cache_file, "r", encoding="utf-8") as f:
    payload = json.load(f)

items = payload.get("data", [])
if not items:
    print("No quote items found")
    exit(0)

conn = sqlite3.connect(db_file)
cur = conn.cursor()
cur.execute("DELETE FROM inspirations WHERE tags LIKE '%金句%'")
insert = "INSERT INTO inspirations (content, tags) VALUES (?, ?)"
for item in items:
    content = item.get("content") or item.get("title") or ""
    platform = item.get("platform", "")
    label = "网易云热评" if platform == "netease" else "一言" if platform == "hitokoto" else "文案标签"
    tags = f"金句,{label},{platform}"
    cur.execute(insert, (content, tags))

conn.commit()
cur.execute("SELECT COUNT(*) FROM inspirations WHERE tags LIKE '%金句%'")
count = cur.fetchone()[0]
conn.close()
print(f"Inserted {count} quote inspirations")
