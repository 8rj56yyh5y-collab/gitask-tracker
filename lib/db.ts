import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// MVP хранит данные в SQLite (встроен в Node). Для продакшена — PostgreSQL (этап 2).

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cost_centers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  monthly_budget INTEGER NOT NULL DEFAULT 0,
  is_internal INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank TEXT NOT NULL,
  last4 TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'personal', -- personal | fop | corporate | cash
  monthly_limit INTEGER NOT NULL DEFAULT 0, -- копейки, 0 = без лимита
  mono_account_id TEXT,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  amount INTEGER NOT NULL, -- копейки; < 0 — списание, > 0 — зачисление
  currency TEXT NOT NULL DEFAULT 'UAH',
  card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,
  cost_center_id INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'expense', -- expense | income | internal
  for_whom TEXT NOT NULL DEFAULT '',
  counterparty TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual', -- manual | applepay | sms | monobank | import
  external_id TEXT UNIQUE,
  raw TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_at TEXT
);

-- Кассы (наличные): остаток = начальный остаток + все движения кассы.
CREATE TABLE IF NOT EXISTS cashboxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#16a34a',
  opening INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Запланированные платежи и покупки с оплатой частями. Оплачено = сумма операций с plan_id.
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  payee TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL,
  due_date TEXT, -- YYYY-MM-DD или NULL
  card_id INTEGER,
  cashbox_id INTEGER,
  cost_center_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  repeat TEXT NOT NULL DEFAULT 'none', -- none | month
  status TEXT NOT NULL DEFAULT 'open', -- open | done | cancelled
  reminded_on TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  done_at TEXT
);

-- Товары компании: группа задаёт проценты, у товара — цены за количество (наборы).
CREATE TABLE IF NOT EXISTS product_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sales_rate REAL NOT NULL DEFAULT 0, -- % отделу продаж (ваш доход)
  mp_rate REAL NOT NULL DEFAULT 0,    -- % маркетплейса
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  group_id INTEGER,
  unit TEXT NOT NULL DEFAULT 'уп.',
  tiers TEXT NOT NULL DEFAULT '[]', -- [{"qty":1,"price":45000},{"qty":3,"price":120000}]
  archived INTEGER NOT NULL DEFAULT 0
);
-- Продажа товара компании. Ставки и суммы сохраняются в момент продажи.
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  total INTEGER NOT NULL,
  channel TEXT NOT NULL DEFAULT 'direct', -- direct | mp
  sales_rate REAL NOT NULL DEFAULT 0,
  mp_rate REAL NOT NULL DEFAULT 0,
  mp_fee INTEGER NOT NULL DEFAULT 0,
  commission INTEGER NOT NULL DEFAULT 0, -- доход отдела продаж
  company_share INTEGER NOT NULL DEFAULT 0, -- деньги компании
  tx_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Передача денег компании (уменьшает долг компании).
CREATE TABLE IF NOT EXISTS company_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  amount INTEGER NOT NULL,
  tx_id INTEGER,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Разборы месяца от ИИ (кешируются, чтобы не платить за повторный запрос).
CREATE TABLE IF NOT EXISTS ai_reports (
  month TEXT PRIMARY KEY, -- YYYY-MM
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tx_unassigned ON transactions(cost_center_id, kind);
CREATE INDEX IF NOT EXISTS idx_tx_card_date ON transactions(card_id, occurred_at);
`;

const DEFAULT_CENTERS: [string, string, number][] = [
  ["Отдел продаж", "#2563eb", 0],
  ["Личные", "#9333ea", 0],
  ["Руководитель", "#0d9488", 0],
  ["Приёмные пункты (заготовка)", "#ca8a04", 0],
  ["ФОП (налоги, комиссии)", "#dc2626", 0],
  ["Внутренние переводы", "#6b7280", 1],
];

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const file = process.env.DN_DB_PATH ?? path.join(process.cwd(), "data", "dn.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  // Миграции для баз, созданных старыми версиями.
  const cardCols = (db.prepare("PRAGMA table_info(cards)").all() as { name: string }[]).map((c) => c.name);
  // С какого момента вести операции карты (ISO). Более ранние операции из банка не записываются.
  if (!cardCols.includes("track_from")) db.exec("ALTER TABLE cards ADD COLUMN track_from TEXT");
  // Цвет и значок карты (по умолчанию — цвета банка).
  if (!cardCols.includes("color")) db.exec("ALTER TABLE cards ADD COLUMN color TEXT");
  if (!cardCols.includes("badge")) db.exec("ALTER TABLE cards ADD COLUMN badge TEXT");
  // Дополнительная карта входит в основную: у группы один лимит (например, все карты Monobank).
  if (!cardCols.includes("parent_id")) db.exec("ALTER TABLE cards ADD COLUMN parent_id INTEGER");
  const boxCols = (db.prepare("PRAGMA table_info(cashboxes)").all() as { name: string }[]).map((c) => c.name);
  // Категория кассы: расходы из неё по умолчанию записываются туда.
  if (!boxCols.includes("center_id")) db.exec("ALTER TABLE cashboxes ADD COLUMN center_id INTEGER");
  const planCols = (db.prepare("PRAGMA table_info(plans)").all() as { name: string }[]).map((c) => c.name);
  // out — я плачу; in — мне должны (ожидаемое поступление).
  if (!planCols.includes("direction")) db.exec("ALTER TABLE plans ADD COLUMN direction TEXT NOT NULL DEFAULT 'out'");
  // Ежемесячный платёж, созданный автоматически после оплаты предыдущего (чтобы отмена оплаты убрала его).
  if (!planCols.includes("prev_id")) db.exec("ALTER TABLE plans ADD COLUMN prev_id INTEGER");
  const txCols = (db.prepare("PRAGMA table_info(transactions)").all() as { name: string }[]).map((c) => c.name);
  // Движение кассы, оплата по плану, продажа товара.
  for (const col of ["cashbox_id", "plan_id", "sale_id"]) if (!txCols.includes(col)) db.exec(`ALTER TABLE transactions ADD COLUMN ${col} INTEGER`);
  const count = db.prepare("SELECT COUNT(*) AS n FROM cost_centers").get() as { n: number };
  if (count.n === 0) {
    const ins = db.prepare("INSERT INTO cost_centers (name, color, is_internal) VALUES (?, ?, ?)");
    for (const [name, color, internal] of DEFAULT_CENTERS) ins.run(name, color, internal);
  }
  return db;
}
