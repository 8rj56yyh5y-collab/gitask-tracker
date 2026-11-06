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
  const count = db.prepare("SELECT COUNT(*) AS n FROM cost_centers").get() as { n: number };
  if (count.n === 0) {
    const ins = db.prepare("INSERT INTO cost_centers (name, color, is_internal) VALUES (?, ?, ?)");
    for (const [name, color, internal] of DEFAULT_CENTERS) ins.run(name, color, internal);
  }
  return db;
}
