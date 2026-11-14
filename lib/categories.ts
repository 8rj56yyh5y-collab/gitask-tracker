import { getDb } from "./db.ts";

// Категории — «на что именно ушли деньги». Направление — «чьи это деньги» (личные, отдел…).

export interface Category {
  id: number;
  name: string;
  emoji: string;
  grp: string;
  enabled: number;
  custom: number;
  sort: number;
}

/** Короткое имя для плитки: «Общественный транспорт» → «Транспорт». Полное — в подсказке. */
const SHORT: Record<string, string> = {
  "Кафе и рестораны": "Кафе", "Доставка еды": "Доставка", "Общественный транспорт": "Транспорт", "Авто: ремонт и обслуживание": "Авто",
  "Аренда жилья": "Аренда", "Коммунальные услуги": "Коммуналка", "Связь и интернет": "Связь", "Мебель и товары для дома": "Для дома",
  "Бытовая химия": "Химия", "Врачи и анализы": "Врачи", "Стоматология": "Зубы", "Одежда и обувь": "Одежда", "Красота и уход": "Красота",
  "Кино, концерты, события": "События", "Книги и обучение": "Обучение", "Техника и электроника": "Техника", "Кредиты и рассрочки": "Кредиты",
  "Комиссии банка": "Комиссии", "Благотворительность": "Помощь", "Переводы людям": "Переводы", "Товар и закупка": "Закупка",
  "Доставка и почта": "Почта", "Инструменты и оборудование": "Инструменты", "Аренда помещения": "Офис", "Развлечения": "Отдых",
};
export function shortName(name: string): string {
  if (SHORT[name]) return SHORT[name];
  const cut = name.split(/\s+и\s+|[:,]/)[0].trim();
  return cut || name;
}

export const label = (c: Pick<Category, "emoji" | "name">) => `${c.emoji ? `${c.emoji} ` : ""}${c.name}`;

export function listCategories(all = false): Category[] {
  return getDb()
    .prepare(`SELECT * FROM categories ${all ? "" : "WHERE enabled = 1"} ORDER BY sort, name`)
    .all() as unknown as Category[];
}

export function getCategory(id: number | null | undefined): Category | null {
  if (!id) return null;
  return (getDb().prepare("SELECT * FROM categories WHERE id = ?").get(id) as unknown as Category) ?? null;
}

export function setCategoryEnabled(id: number, on: boolean) {
  getDb().prepare("UPDATE categories SET enabled = ? WHERE id = ?").run(on ? 1 : 0, id);
}

export function addCategory(name: string, emoji = ""): number {
  const n = name.trim();
  if (!n) throw new Error("Напишите название категории");
  const db = getDb();
  // lower() в SQLite не понимает кириллицу — сравниваем здесь.
  const same = (db.prepare("SELECT id, name FROM categories").all() as { id: number; name: string }[]).find(
    (c) => c.name.toLocaleLowerCase("ru") === n.toLocaleLowerCase("ru"),
  );
  if (same) {
    setCategoryEnabled(same.id, true);
    return same.id;
  }
  const max = db.prepare("SELECT COALESCE(MAX(sort), 0) AS m FROM categories").get() as { m: number };
  const r = db
    .prepare("INSERT INTO categories (name, emoji, grp, enabled, custom, sort) VALUES (?, ?, 'Мои', 1, 1, ?)")
    .run(n.slice(0, 40), emoji.trim().slice(0, 4), Number(max.m) + 1);
  return Number(r.lastInsertRowid);
}

export function renameCategory(id: number, name: string, emoji: string) {
  if (!name.trim()) return;
  getDb().prepare("UPDATE categories SET name = ?, emoji = ? WHERE id = ?").run(name.trim().slice(0, 40), emoji.trim().slice(0, 4), id);
}

/** Категории, которые раньше выбирали для этого магазина/получателя, — самые частые первыми. */
export function categoriesFromHistory(tx: { counterparty?: string | null; description?: string | null; id?: number }, limit = 3): number[] {
  const key = (tx.counterparty || "").trim();
  if (!key) return [];
  const rows = getDb()
    .prepare(
      `SELECT t.category_id AS id, COUNT(*) AS n FROM transactions t JOIN categories c ON c.id = t.category_id AND c.enabled = 1
       WHERE t.category_id IS NOT NULL AND t.counterparty = ? AND t.id != ? GROUP BY t.category_id ORDER BY n DESC LIMIT ?`,
    )
    .all(key, tx.id ?? 0, limit) as { id: number }[];
  return rows.map((r) => Number(r.id));
}

/** Самые используемые категории за 90 дней (для быстрых кнопок). */
export function popularCategories(limit = 8): number[] {
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const used = getDb()
    .prepare(
      `SELECT t.category_id AS id, COUNT(*) AS n FROM transactions t JOIN categories c ON c.id = t.category_id AND c.enabled = 1
       WHERE t.category_id IS NOT NULL AND t.occurred_at >= ? GROUP BY t.category_id ORDER BY n DESC LIMIT ?`,
    )
    .all(since, limit) as { id: number }[];
  const ids = used.map((r) => Number(r.id));
  for (const c of listCategories()) {
    if (ids.length >= limit) break;
    if (!ids.includes(c.id)) ids.push(c.id);
  }
  return ids;
}

/** Порядок кнопок для операции: подсказка ИИ, история, популярные. */
export function suggestedCategories(tx: { id: number; counterparty?: string | null; ai_category_id?: number | null }, limit = 8): number[] {
  const enabled = new Set(listCategories().map((c) => c.id));
  const out: number[] = [];
  const push = (id: number | null | undefined) => {
    if (id && enabled.has(id) && !out.includes(id) && out.length < limit) out.push(id);
  };
  push(tx.ai_category_id);
  categoriesFromHistory(tx).forEach(push);
  popularCategories(limit).forEach(push);
  return out;
}

/** Записать категорию и комментарий. Комментарий снимает отметку «нужен комментарий». */
export function setTxDetails(txId: number, d: { categoryId?: number | null; note?: string | null }) {
  const db = getDb();
  if (d.categoryId !== undefined) db.prepare("UPDATE transactions SET category_id = ? WHERE id = ?").run(d.categoryId || null, txId);
  if (d.note !== undefined && d.note !== null && d.note.trim()) {
    db.prepare("UPDATE transactions SET description = ?, needs_note = 0 WHERE id = ?").run(d.note.trim().slice(0, 200), txId);
  }
}

export function markNeedsNote(txId: number, on = true) {
  getDb().prepare("UPDATE transactions SET needs_note = ? WHERE id = ?").run(on ? 1 : 0, txId);
}

/** Траты месяца по категориям (для аналитики). */
export function spendByCategory(from: string, to: string, centerIds?: number[]) {
  const filter = centerIds ? ` AND t.cost_center_id IN (${centerIds.length ? centerIds.join(",") : "NULL"})` : "";
  return getDb()
    .prepare(
      `SELECT c.id, c.name, c.emoji, SUM(-t.amount) AS spent, COUNT(*) AS n FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.kind = 'expense' AND t.occurred_at >= ? AND t.occurred_at < ?${filter}
       GROUP BY c.id ORDER BY spent DESC`,
    )
    .all(from, to) as { id: number | null; name: string | null; emoji: string | null; spent: number; n: number }[];
}
