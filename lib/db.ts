import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { MAIN, currentTenant } from "./tenant.ts";

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
-- Категории — «на что именно» (продукты, такси…). Отдельно от направлений («чьи деньги»).
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '',
  grp TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  custom INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);

-- Как карта называется в Wallet/SMS → какая это карта у вас. Запоминается, когда вы выбираете карту вручную.
CREATE TABLE IF NOT EXISTS card_aliases (
  alias TEXT PRIMARY KEY,
  card_id INTEGER NOT NULL
);

-- Дополнительные аккаунты (хранятся только в основной базе). У каждого — своя база acc-<id>.db.
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  ver INTEGER NOT NULL DEFAULT 1,
  ingest_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  done_at TEXT
);

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

/** Направления для нового (не основного) аккаунта — общие, понятные всем. */
const STARTER_CENTERS: [string, string, number][] = [
  ["Личные", "#9333ea", 0],
  ["Семья", "#db2777", 0],
  ["Работа", "#2563eb", 0],
  ["Внутренние переводы", "#6b7280", 1],
];

const dbs = new Map<string, DatabaseSync>();

function baseFile(): string {
  return process.env.DN_DB_PATH ?? path.join(process.cwd(), "data", "dn.db");
}

/** Файл базы аккаунта: основной — как раньше, остальные — рядом, acc-<id>.db. */
export function tenantFile(tenant: string): string {
  const base = baseFile();
  if (tenant === MAIN || base === ":memory:") return base;
  return path.join(path.dirname(base), `acc-${tenant}.db`);
}

/** База текущего аккаунта (по входу или явно заданного). */
export function getDb(): DatabaseSync {
  return openTenant(currentTenant());
}

/** Основная база: в ней же список дополнительных аккаунтов. */
export function getMainDb(): DatabaseSync {
  return openTenant(MAIN);
}

/** Закрыть базу аккаунта (перед удалением файла). */
export function closeTenant(tenant: string) {
  dbs.get(tenant)?.close();
  dbs.delete(tenant);
}

function openTenant(tenant: string): DatabaseSync {
  const cached = dbs.get(tenant);
  if (cached) return cached;
  if (tenant !== MAIN) {
    const known = getMainDb().prepare("SELECT 1 FROM accounts WHERE id = ?").get(tenant);
    if (!known) throw new Error("Аккаунт не найден или удалён. Войдите снова.");
  }
  const file = tenantFile(tenant);
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  dbs.set(tenant, db);
  migrate(db, tenant);
  return db;
}

function migrate(db: DatabaseSync, tenant: string) {
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
  // salary — регулярный доход («ставка»); auto — зачислять в день сам, не дожидаясь банка.
  if (!planCols.includes("kind")) db.exec("ALTER TABLE plans ADD COLUMN kind TEXT NOT NULL DEFAULT ''");
  if (!planCols.includes("auto")) db.exec("ALTER TABLE plans ADD COLUMN auto INTEGER NOT NULL DEFAULT 0");
  const txCols = (db.prepare("PRAGMA table_info(transactions)").all() as { name: string }[]).map((c) => c.name);
  // Движение кассы, оплата по плану, продажа товара.
  for (const col of ["cashbox_id", "plan_id", "sale_id"]) if (!txCols.includes(col)) db.exec(`ALTER TABLE transactions ADD COLUMN ${col} INTEGER`);
  // Транзит: чужие деньги, которые прошли через меня (не доход и не расход).
  if (!txCols.includes("transit_id")) db.exec("ALTER TABLE transactions ADD COLUMN transit_id INTEGER");
  // Вид дохода: salary — ставка, other — прочий доход.
  if (!txCols.includes("income_kind")) db.exec("ALTER TABLE transactions ADD COLUMN income_kind TEXT");
  // Категория («на что именно»), подсказка ИИ и обязательный комментарий из Telegram.
  if (!txCols.includes("category_id")) db.exec("ALTER TABLE transactions ADD COLUMN category_id INTEGER");
  if (!txCols.includes("ai_category_id")) db.exec("ALTER TABLE transactions ADD COLUMN ai_category_id INTEGER");
  if (!txCols.includes("ai_note")) db.exec("ALTER TABLE transactions ADD COLUMN ai_note TEXT");
  if (!txCols.includes("needs_note")) db.exec("ALTER TABLE transactions ADD COLUMN needs_note INTEGER NOT NULL DEFAULT 0");
  seedCategories(db);
  const centerCols = (db.prepare("PRAGMA table_info(cost_centers)").all() as { name: string }[]).map((c) => c.name);
  // Личное направление: только его доходы и расходы входят в «Мои деньги за месяц».
  // Пароль дополнительного аккаунта в зашифрованном виде — чтобы владелец мог снова его посмотреть и переслать.
  const accCols = (db.prepare("PRAGMA table_info(accounts)").all() as { name: string }[]).map((c) => c.name);
  if (!accCols.includes("pass_enc")) db.exec("ALTER TABLE accounts ADD COLUMN pass_enc TEXT");
  if (!centerCols.includes("is_personal")) db.exec("ALTER TABLE cost_centers ADD COLUMN is_personal INTEGER NOT NULL DEFAULT 0");
  linkCashboxesByName(db);
  const count = db.prepare("SELECT COUNT(*) AS n FROM cost_centers").get() as { n: number };
  if (count.n === 0) {
    const ins = db.prepare("INSERT INTO cost_centers (name, color, is_internal) VALUES (?, ?, ?)");
    for (const [name, color, internal] of tenant === MAIN ? DEFAULT_CENTERS : STARTER_CENTERS) ins.run(name, color, internal);
  }
  // Один раз: «Личные…» — это мои деньги (входит в «Мои деньги за месяц»). Дальше — как отметит человек.
  if (!db.prepare("SELECT 1 FROM settings WHERE key = 'personal_marked'").get()) {
    db.exec("UPDATE cost_centers SET is_personal = 1 WHERE name LIKE 'Личн%' OR name LIKE 'личн%' OR name LIKE 'Особист%'");
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('personal_marked', '1')").run();
  }
  return;
}

/**
 * Касса и направление с одинаковым смыслом («Личная касса» и «Личные») — это одно и то же:
 * привязываем кассу к направлению, чтобы не было двух отдельных сущностей. Один раз.
 */
function linkCashboxesByName(db: DatabaseSync) {
  const done = db.prepare("SELECT value FROM settings WHERE key = 'boxes_linked'").get();
  if (done) return;
  const norm = (s: string) => s.toLowerCase().replace(/касс[аы]?/g, "").replace(/[^a-zа-яёіїєґ0-9]/gi, "").slice(0, 4);
  const centers = db.prepare("SELECT id, name FROM cost_centers WHERE is_internal = 0 AND archived = 0").all() as { id: number; name: string }[];
  const boxes = db.prepare("SELECT id, name FROM cashboxes WHERE center_id IS NULL AND archived = 0").all() as { id: number; name: string }[];
  for (const b of boxes) {
    const key = norm(b.name);
    if (key.length < 3) continue;
    const matches = centers.filter((c) => norm(c.name) === key);
    if (matches.length === 1) db.prepare("UPDATE cashboxes SET center_id = ? WHERE id = ?").run(matches[0].id, b.id);
  }
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('boxes_linked', '1')").run();
}

/** Готовый список категорий: включены самые частые, остальные можно включить в «Категориях». */
export const CATEGORY_CATALOG: [string, string, string, boolean][] = [
  // [название, значок, группа, включена по умолчанию]
  ["Продукты", "🛒", "Еда", true],
  ["Кафе и рестораны", "🍽", "Еда", true],
  ["Кофе", "☕", "Еда", false],
  ["Доставка еды", "🍔", "Еда", true],
  ["Топливо", "⛽", "Транспорт", true],
  ["Такси", "🚕", "Транспорт", true],
  ["Общественный транспорт", "🚌", "Транспорт", true],
  ["Авто: ремонт и обслуживание", "🚗", "Транспорт", true],
  ["Парковка", "🅿️", "Транспорт", false],
  ["Аренда жилья", "🏠", "Дом", true],
  ["Коммунальные услуги", "💡", "Дом", true],
  ["Связь и интернет", "📱", "Дом", true],
  ["Ремонт", "🛠", "Дом", false],
  ["Мебель и товары для дома", "🛋", "Дом", false],
  ["Бытовая химия", "🧴", "Дом", false],
  ["Аптека", "💊", "Здоровье", true],
  ["Врачи и анализы", "🩺", "Здоровье", false],
  ["Стоматология", "🦷", "Здоровье", false],
  ["Одежда и обувь", "👕", "Личное", true],
  ["Красота и уход", "💇", "Личное", true],
  ["Спорт", "🏋️", "Личное", true],
  ["Развлечения", "🎮", "Личное", true],
  ["Кино, концерты, события", "🎬", "Личное", false],
  ["Подписки", "📺", "Личное", true],
  ["Подарки", "🎁", "Личное", true],
  ["Книги и обучение", "📚", "Личное", false],
  ["Дети", "👶", "Личное", true],
  ["Животные", "🐾", "Личное", false],
  ["Путешествия", "✈️", "Личное", true],
  ["Отели", "🏨", "Личное", false],
  ["Техника и электроника", "💻", "Личное", true],
  ["Кредиты и рассрочки", "🏦", "Финансы", false],
  ["Комиссии банка", "💳", "Финансы", true],
  ["Налоги", "🧾", "Финансы", true],
  ["Страхование", "🛡", "Финансы", false],
  ["Благотворительность", "🤝", "Финансы", false],
  ["Переводы людям", "💸", "Финансы", false],
  ["Товар и закупка", "📦", "Работа", true],
  ["Доставка и почта", "🚚", "Работа", true],
  ["Канцелярия", "🖨", "Работа", false],
  ["Реклама", "📣", "Работа", false],
  ["Зарплаты", "👷", "Работа", false],
  ["Инструменты и оборудование", "🧰", "Работа", false],
  ["Аренда помещения", "🏢", "Работа", false],
  ["Другое", "❔", "Другое", true],
];

function seedCategories(db: DatabaseSync) {
  const n = db.prepare("SELECT COUNT(*) AS n FROM categories").get() as { n: number };
  if (n.n > 0) return;
  const ins = db.prepare("INSERT INTO categories (name, emoji, grp, enabled, sort) VALUES (?, ?, ?, ?, ?)");
  CATEGORY_CATALOG.forEach(([name, emoji, grp, on], i) => ins.run(name, emoji, grp, on ? 1 : 0, i));
}
