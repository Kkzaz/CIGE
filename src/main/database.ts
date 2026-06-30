import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

let db: Database.Database;

export function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  const userDbPath = path.join(userDataPath, 'cige.db');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  const resourcesDbPath = path.join(process.resourcesPath, 'cige.db');
  const appDbPath = path.join(app.getAppPath(), '.db', 'cige.db');
  let sourceDbPath: string | null = null;
  if (fs.existsSync(resourcesDbPath)) {
    sourceDbPath = resourcesDbPath;
  } else if (fs.existsSync(appDbPath)) {
    sourceDbPath = appDbPath;
  }
  if (!fs.existsSync(userDbPath) && sourceDbPath) {
    try {
      fs.copyFileSync(sourceDbPath, userDbPath);
    } catch {
    }
  }
  return userDbPath;
}

export function initDatabase(): Database.Database {
  const dbPath = getDbPath();
  console.log('[Database] opening:', dbPath);
  db = new Database(dbPath);
  db.pragma('journal_mode = DELETE');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS writings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '未命名',
      content TEXT NOT NULL DEFAULT '',
      word_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS writing_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      writing_id INTEGER NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      snapshot_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (writing_id) REFERENCES writings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS excerpts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS inspirations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      cover TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      is_favorite INTEGER NOT NULL DEFAULT 0,
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS book_chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      start_paragraph INTEGER NOT NULL DEFAULT 0,
      end_paragraph INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_book_chapters_book_id ON book_chapters(book_id);

    CREATE INDEX IF NOT EXISTS idx_excerpts_tags ON excerpts(tags);
    CREATE INDEX IF NOT EXISTS idx_excerpts_created_at ON excerpts(created_at);
    CREATE INDEX IF NOT EXISTS idx_inspirations_created_at ON inspirations(created_at);
    CREATE INDEX IF NOT EXISTS idx_writings_updated_at ON writings(updated_at);
    CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);
    CREATE INDEX IF NOT EXISTS idx_books_favorite ON books(is_favorite);

    CREATE TABLE IF NOT EXISTS book_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      group_name TEXT NOT NULL DEFAULT '',
      config TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_book_sources_enabled ON book_sources(enabled);
  `);

  // Migration: add `deleted` column for soft delete (if not exists)
  const tables = ['writings', 'excerpts', 'inspirations'];
  for (const table of tables) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0`);
    } catch {
      // Column already exists, ignore
    }
  }

  // Migration: add `folder_id` column to writings (if not exists)
  try {
    db.exec(`ALTER TABLE writings ADD COLUMN folder_id INTEGER`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: create index on folder_id
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_writings_folder_id ON writings(folder_id)`);
  } catch {
    // Index already exists, ignore
  }

  // Migration: add `updated_at` column to inspirations (if not exists)
  try {
    db.exec(`ALTER TABLE inspirations ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: create index on inspirations updated_at
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_inspirations_updated_at ON inspirations(updated_at)`);
  } catch {
    // Index already exists, ignore
  }

  // Migration: add `parent_id` column to folders for nested folders (if not exists)
  try {
    db.exec(`ALTER TABLE folders ADD COLUMN parent_id INTEGER`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: create index on folders parent_id
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id)`);
  } catch {
    // Index already exists, ignore
  }

  // Seed default poetry quotes if excerpts table is empty
  seedDefaultPoetryQuotes(db);

  // Seed default books if books table is empty
  seedDefaultBooks(db);

  return db;
}

function seedDefaultBooks(db: Database.Database): void {
  const count = db.prepare('SELECT COUNT(*) AS c FROM books WHERE deleted = 0').get() as { c: number };
  if (count.c > 0) return;

  const books = [
    {
      title: '唐诗三百首·精选',
      author: '李白、杜甫等',
      description: '唐代诗歌精选集，涵盖盛唐至晚唐名家代表作。',
      content: `静夜思
李白
床前明月光，疑是地上霜。
举头望明月，低头思故乡。

登鹳雀楼
王之涣
白日依山尽，黄河入海流。
欲穷千里目，更上一层楼。

春晓
孟浩然
春眠不觉晓，处处闻啼鸟。
夜来风雨声，花落知多少。

望庐山瀑布
李白
日照香炉生紫烟，遥看瀑布挂前川。
飞流直下三千尺，疑是银河落九天。

送元二使安西
王维
渭城朝雨浥轻尘，客舍青青柳色新。
劝君更尽一杯酒，西出阳关无故人。`,
      cover: '#C4A77D',
      category: '诗歌',
      tags: '唐诗,经典,诗歌',
      is_favorite: 1,
    },
    {
      title: '宋词精选',
      author: '苏轼、李清照等',
      description: '宋代词人经典作品选集，婉约豪放兼收。',
      content: `水调歌头·明月几时有
苏轼
明月几时有？把酒问青天。
不知天上宫阙，今夕是何年。
我欲乘风归去，又恐琼楼玉宇，高处不胜寒。
起舞弄清影，何似在人间。

转朱阁，低绮户，照无眠。
不应有恨，何事长向别时圆？
人有悲欢离合，月有阴晴圆缺，此事古难全。
但愿人长久，千里共婵娟。

如梦令
李清照
昨夜雨疏风骤，浓睡不消残酒。
试问卷帘人，却道海棠依旧。
知否，知否？应是绿肥红瘦。`,
      cover: '#A89F91',
      category: '诗歌',
      tags: '宋词,经典,诗歌',
      is_favorite: 1,
    },
    {
      title: '古文观止·节选',
      author: '吴楚材、吴调侯',
      description: '清代编选的古代散文选本，荟萃历代名篇。',
      content: `陋室铭
刘禹锡
山不在高，有仙则名。水不在深，有龙则灵。斯是陋室，惟吾德馨。苔痕上阶绿，草色入帘青。谈笑有鸿儒，往来无白丁。可以调素琴，阅金经。无丝竹之乱耳，无案牍之劳形。南阳诸葛庐，西蜀子云亭。孔子云：何陋之有？

爱莲说
周敦颐
水陆草木之花，可爱者甚蕃。晋陶渊明独爱菊。自李唐来，世人甚爱牡丹。予独爱莲之出淤泥而不染，濯清涟而不妖，中通外直，不蔓不枝，香远益清，亭亭净植，可远观而不可亵玩焉。`,
      cover: '#8B7355',
      category: '散文',
      tags: '古文,散文,经典',
      is_favorite: 0,
    },
    {
      title: '现代诗选',
      author: '徐志摩、林徽因等',
      description: '中国现代诗歌经典作品选读。',
      content: `再别康桥
徐志摩
轻轻的我走了，
正如我轻轻的来；
我轻轻的招手，
作别西天的云彩。

那河畔的金柳，
是夕阳中的新娘；
波光里的艳影，
在我的心头荡漾。

悄悄的我走了，
正如我悄悄的来；
我挥一挥衣袖，
不带走一片云彩。

你是人间的四月天
林徽因
我说你是人间的四月天；
笑响点亮了四面风；
轻灵在春的光艳中交舞着变。
你是四月早天里的云烟，
黄昏吹着风的软，
星子在无意中闪，
细雨点洒在花前。`,
      cover: '#B8A99A',
      category: '诗歌',
      tags: '现代诗,诗歌',
      is_favorite: 0,
    },
    {
      title: '世说新语·节选',
      author: '刘义庆',
      description: '南朝宋时期志人小说集，记录名士言行。',
      content: `咏雪
谢太傅寒雪日内集，与儿女讲论文义。俄而雪骤，公欣然曰："白雪纷纷何所似？"兄子胡儿曰："撒盐空中差可拟。"兄女曰："未若柳絮因风起。"公大笑乐。即公大兄无奕女，左将军王凝之妻也。

陈太丘与友期行
陈太丘与友期行，期日中。过中不至，太丘舍去，去后乃至。元方时年七岁，门外戏。客问元方："尊君在不？"答曰："待君久不至，已去。"友人便怒曰："非人哉！与人期行，相委而去。"元方曰："君与家君期日中。日中不至，则是无信；对子骂父，则是无礼。"友人惭，下车引之。元方入门不顾。`,
      cover: '#9E8B7D',
      category: '笔记',
      tags: '志人小说,古典,笔记',
      is_favorite: 0,
    },
  ];

  const insert = db.prepare(
    'INSERT INTO books (title, author, description, content, cover, category, tags, is_favorite) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertMany = db.transaction((rows: typeof books) => {
    for (const row of rows) insert.run(row.title, row.author, row.description, row.content, row.cover, row.category, row.tags, row.is_favorite);
  });
  insertMany(books);
}

function seedDefaultPoetryQuotes(db: Database.Database): void {
  const count = db.prepare('SELECT COUNT(*) AS c FROM excerpts WHERE deleted = 0').get() as { c: number };
  if (count.c > 0) return;

  const quotes = [
    { content: '山有木兮木有枝，心悦君兮君不知。', source: '《越人歌》', tags: '诗词,名句,爱情' },
    { content: '人生若只如初见，何事秋风悲画扇。', source: '纳兰性德《木兰花令》', tags: '诗词,名句,人生' },
    { content: '曾经沧海难为水，除却巫山不是云。', source: '元稹《离思五首·其四》', tags: '诗词,名句,爱情' },
    { content: '愿得一心人，白头不相离。', source: '卓文君《白头吟》', tags: '诗词,名句,爱情' },
    { content: '两情若是久长时，又岂在朝朝暮暮。', source: '秦观《鹊桥仙》', tags: '诗词,名句,爱情' },
    { content: '身无彩凤双飞翼，心有灵犀一点通。', source: '李商隐《无题》', tags: '诗词,名句,爱情' },
    { content: '大漠孤烟直，长河落日圆。', source: '王维《使至塞上》', tags: '诗词,名句,写景' },
    { content: '落霞与孤鹜齐飞，秋水共长天一色。', source: '王勃《滕王阁序》', tags: '诗词,名句,写景' },
    { content: '春江潮水连海平，海上明月共潮生。', source: '张若虚《春江花月夜》', tags: '诗词,名句,写景' },
    { content: '长风破浪会有时，直挂云帆济沧海。', source: '李白《行路难》', tags: '诗词,名句,励志' },
    { content: '天生我材必有用，千金散尽还复来。', source: '李白《将进酒》', tags: '诗词,名句,励志' },
    { content: '会当凌绝顶，一览众山小。', source: '杜甫《望岳》', tags: '诗词,名句,励志' },
    { content: '采菊东篱下，悠然见南山。', source: '陶渊明《饮酒·其五》', tags: '诗词,名句,隐逸' },
    { content: '海内存知己，天涯若比邻。', source: '王勃《送杜少府之任蜀州》', tags: '诗词,名句,友情' },
    { content: '莫愁前路无知己，天下谁人不识君。', source: '高适《别董大》', tags: '诗词,名句,友情' },
    { content: '知否，知否？应是绿肥红瘦。', source: '李清照《如梦令》', tags: '诗词,名句,婉约' },
    { content: '众里寻他千百度，蓦然回首，那人却在，灯火阑珊处。', source: '辛弃疾《青玉案·元夕》', tags: '诗词,名句,爱情' },
    { content: '问君能有几多愁？恰似一江春水向东流。', source: '李煜《虞美人》', tags: '诗词,名句,愁绪' },
    { content: '十年生死两茫茫，不思量，自难忘。', source: '苏轼《江城子》', tags: '诗词,名句,悼亡' },
    { content: '但愿人长久，千里共婵娟。', source: '苏轼《水调歌头》', tags: '诗词,名句,祝愿' },
  ];

  const insert = db.prepare('INSERT INTO excerpts (content, source, tags) VALUES (?, ?, ?)');
  const insertMany = db.transaction((rows: typeof quotes) => {
    for (const row of rows) insert.run(row.content, row.source, row.tags);
  });
  insertMany(quotes);
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
  }
}
