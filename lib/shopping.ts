import { getDb } from "./db.ts";
import { insertTx } from "./repo.ts";
import { setTxDetails } from "./categories.ts";

// Список покупок: что купить → отметки в магазине → цены → «Закрыть чек» = расход.
// По товарам видно, сколько на них уходит и сколько они стоят.

export interface ShoppingItem {
  id: number;
  list_id: number;
  name: string;
  qty: number | null;
  unit: string;
  price: number | null;
  bought: number;
  sort: number;
}

export interface ShoppingList {
  id: number;
  title: string;
  store: string;
  status: "open" | "closed";
  tx_id: number | null;
  total: number | null;
  created_at: string;
  closed_at: string | null;
  items: ShoppingItem[];
}

export const UNITS = ["шт", "кг", "г", "л", "мл", "уп"] as const;

/** «Яйца 10 шт», «фарш 0,5 кг», «молоко 2» → название, количество, единица. */
export function parseItem(text: string): { name: string; qty: number | null; unit: string } {
  const t = text.trim().replace(/\s+/g, " ");
  const m = /^(.*?)[\s,]+(\d+(?:[.,]\d+)?)\s*(шт|кг|г|гр|л|мл|уп)?\.?$/i.exec(t);
  if (!m || !m[1].trim()) return { name: t.slice(0, 60), qty: null, unit: "" };
  const unit = (m[3] ?? "").toLowerCase().replace("гр", "г");
  return { name: m[1].trim().slice(0, 60), qty: Number(m[2].replace(",", ".")), unit: unit || "шт" };
}

const norm = (name: string) => name.trim().toLocaleLowerCase("ru").replace(/ё/g, "е");

export function createList(title = "", items: string[] = []): number {
  const d = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const r = getDb().prepare("INSERT INTO shopping_lists (title) VALUES (?)").run(title.trim().slice(0, 60) || `Покупки ${d}`);
  const id = Number(r.lastInsertRowid);
  for (const it of items) if (it.trim()) addItem(id, it);
  return id;
}

export function getList(id: number): ShoppingList | null {
  const db = getDb();
  const l = db.prepare("SELECT * FROM shopping_lists WHERE id = ?").get(id) as unknown as Omit<ShoppingList, "items"> | undefined;
  if (!l) return null;
  // Обычные объекты (а не строки SQLite) — их можно передать в браузерный компонент.
  const items = (db.prepare("SELECT * FROM shopping_items WHERE list_id = ? ORDER BY sort, id").all(id) as unknown as ShoppingItem[]).map((i) => ({
    ...i,
  }));
  return { ...l, items };
}

export function listLists(status: "open" | "closed", limit = 30): ShoppingList[] {
  const rows = getDb()
    .prepare(`SELECT id FROM shopping_lists WHERE status = ? ORDER BY ${status === "open" ? "created_at DESC" : "closed_at DESC"} LIMIT ?`)
    .all(status, limit) as { id: number }[];
  return rows.map((r) => getList(Number(r.id))!).filter(Boolean);
}

export function addItem(listId: number, text: string): number | null {
  const p = parseItem(text);
  if (!p.name) return null;
  const max = getDb().prepare("SELECT COALESCE(MAX(sort), 0) AS m FROM shopping_items WHERE list_id = ?").get(listId) as { m: number };
  const r = getDb()
    .prepare("INSERT INTO shopping_items (list_id, name, qty, unit, sort) VALUES (?, ?, ?, ?, ?)")
    .run(listId, p.name, p.qty, p.qty ? p.unit : "", Number(max.m) + 1);
  return Number(r.lastInsertRowid);
}

export function updateItem(id: number, d: { qty?: number | null; unit?: string; price?: number | null; bought?: boolean; name?: string }) {
  const db = getDb();
  if (d.name !== undefined && d.name.trim()) db.prepare("UPDATE shopping_items SET name = ? WHERE id = ?").run(d.name.trim().slice(0, 60), id);
  if (d.qty !== undefined) db.prepare("UPDATE shopping_items SET qty = ? WHERE id = ?").run(d.qty && d.qty > 0 ? d.qty : null, id);
  if (d.unit !== undefined) db.prepare("UPDATE shopping_items SET unit = ? WHERE id = ?").run((UNITS as readonly string[]).includes(d.unit) ? d.unit : "", id);
  if (d.price !== undefined) db.prepare("UPDATE shopping_items SET price = ? WHERE id = ?").run(d.price && d.price > 0 ? d.price : null, id);
  if (d.bought !== undefined) db.prepare("UPDATE shopping_items SET bought = ? WHERE id = ?").run(d.bought ? 1 : 0, id);
}

export function deleteItem(id: number) {
  getDb().prepare("DELETE FROM shopping_items WHERE id = ?").run(id);
}

export function renameList(id: number, title: string, store: string) {
  getDb().prepare("UPDATE shopping_lists SET title = ?, store = ? WHERE id = ?").run(title.trim().slice(0, 60) || "Покупки", store.trim().slice(0, 60), id);
}

export function deleteList(id: number) {
  const db = getDb();
  db.prepare("DELETE FROM shopping_items WHERE list_id = ?").run(id);
  db.prepare("DELETE FROM shopping_lists WHERE id = ?").run(id);
}

/** Сумма по ценам купленного. */
export function listSum(l: ShoppingList): number {
  return l.items.filter((i) => i.bought).reduce((a, i) => a + (i.price ?? 0), 0);
}

/**
 * Закрыть чек: создаётся расход на сумму (по ценам или введённую вручную).
 * Некупленное можно перенести в новый список. Возвращает id расхода и нового списка (если есть).
 */
export function closeList(
  id: number,
  o: { total?: number | null; centerId: number; categoryId?: number | null; cardId?: number | null; cashboxId?: number | null; carryOver?: boolean },
): { txId: number; nextListId: number | null } {
  const l = getList(id);
  if (!l || l.status !== "open") throw new Error("Список уже закрыт");
  const total = o.total && o.total > 0 ? o.total : listSum(l);
  if (!(total > 0)) throw new Error("Укажите сумму чека или цены купленных товаров");
  if (!o.centerId) throw new Error("Выберите направление");
  const bought = l.items.filter((i) => i.bought);
  const note = (bought.length ? bought : l.items).map((i) => i.name).slice(0, 8).join(", ");
  const txId = insertTx({
    amountKop: -total,
    costCenterId: o.centerId,
    cardId: o.cardId ?? null,
    cashboxId: o.cashboxId ?? null,
    counterparty: l.store || l.title,
    description: note,
    source: "manual",
  }).id;
  setTxDetails(txId, { categoryId: o.categoryId ?? null, note });
  getDb().prepare("UPDATE shopping_lists SET status = 'closed', tx_id = ?, total = ?, closed_at = ? WHERE id = ?").run(txId, total, new Date().toISOString(), id);
  let nextListId: number | null = null;
  const left = l.items.filter((i) => !i.bought);
  if (o.carryOver && left.length) {
    nextListId = createList("");
    for (const i of left) {
      getDb()
        .prepare("INSERT INTO shopping_items (list_id, name, qty, unit, sort) VALUES (?, ?, ?, ?, ?)")
        .run(nextListId, i.name, i.qty, i.unit, i.sort);
    }
  }
  return { txId, nextListId };
}

/** Просто закрыть список — без расхода. Некупленное можно перенести в новый список. */
export function closeListPlain(id: number, carryOver = false): number | null {
  const l = getList(id);
  if (!l || l.status !== "open") throw new Error("Список уже закрыт");
  getDb().prepare("UPDATE shopping_lists SET status = 'closed', closed_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  const left = l.items.filter((i) => !i.bought);
  if (!carryOver || !left.length) return null;
  const next = createList("");
  for (const i of left) {
    getDb().prepare("INSERT INTO shopping_items (list_id, name, qty, unit, sort) VALUES (?, ?, ?, ?, ?)").run(next, i.name, i.qty, i.unit, i.sort);
  }
  return next;
}

/** Снова открыть закрытый без расхода список. */
export function reopenList(id: number) {
  getDb().prepare("UPDATE shopping_lists SET status = 'open', closed_at = NULL WHERE id = ? AND tx_id IS NULL").run(id);
}

/** Прошлая цена товара (за единицу, если есть количество) — подсказка в магазине. */
export function lastPrices(names: string[]): Map<string, { price: number; qty: number | null; unit: string }> {
  const out = new Map<string, { price: number; qty: number | null; unit: string }>();
  const rows = getDb()
    .prepare(
      `SELECT i.name, i.price, i.qty, i.unit FROM shopping_items i JOIN shopping_lists l ON l.id = i.list_id
       WHERE i.price IS NOT NULL AND i.bought = 1 AND l.status = 'closed' ORDER BY l.closed_at DESC LIMIT 2000`,
    )
    .all() as { name: string; price: number; qty: number | null; unit: string }[];
  const wanted = new Set(names.map(norm));
  for (const r of rows) {
    const k = norm(r.name);
    if (wanted.has(k) && !out.has(k)) out.set(k, { price: Number(r.price), qty: r.qty, unit: r.unit });
  }
  return out;
}

export interface ItemStat {
  name: string;
  times: number;
  spent: number;
  /** Средняя цена за единицу (если везде указано количество в одной единице). */
  perUnit: number | null;
  unit: string;
  qty: number;
}

/** Сколько потрачено на каждый товар с даты `from` (по закрытым чекам). */
export function itemStats(from: string): ItemStat[] {
  const rows = getDb()
    .prepare(
      `SELECT i.name, i.price, i.qty, i.unit FROM shopping_items i JOIN shopping_lists l ON l.id = i.list_id
       WHERE i.bought = 1 AND i.price IS NOT NULL AND l.status = 'closed' AND l.closed_at >= ?`,
    )
    .all(from) as { name: string; price: number; qty: number | null; unit: string }[];
  const map = new Map<string, ItemStat & { units: Set<string>; qtyPriced: number; spentQty: number }>();
  for (const r of rows) {
    const k = norm(r.name);
    const s = map.get(k) ?? { name: r.name, times: 0, spent: 0, perUnit: null, unit: "", qty: 0, units: new Set(), qtyPriced: 0, spentQty: 0 };
    s.times++;
    s.spent += Number(r.price);
    if (r.qty && r.unit) {
      s.units.add(r.unit);
      s.qtyPriced += r.qty;
      s.spentQty += Number(r.price);
    }
    map.set(k, s);
  }
  return [...map.values()]
    .map(({ units, qtyPriced, spentQty, ...s }) => {
      const unit = units.size === 1 ? [...units][0] : "";
      return { ...s, unit, qty: unit ? qtyPriced : 0, perUnit: unit && qtyPriced > 0 ? Math.round(spentQty / qtyPriced) : null };
    })
    .sort((a, b) => b.spent - a.spent);
}
