import { getDb } from "./db.ts";
import { assignTx, insertTx } from "./repo.ts";
import { setTxDetails } from "./categories.ts";

// Список покупок: что купить → отметки в магазине → цены → «Закрыть чек» = расход.
// По товарам видно, сколько на них уходит и сколько они стоят.

export interface ShoppingItem {
  id: number;
  grp?: string;
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
  source?: string;
  receipt_date?: string | null;
  receipt_total?: number | null;
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
  o: {
    total?: number | null;
    centerId: number;
    categoryId?: number | null;
    cardId?: number | null;
    cashboxId?: number | null;
    carryOver?: boolean;
    /** Объединить с уже пришедшей оплатой из банка вместо нового расхода. */
    mergeTxId?: number | null;
  },
): { txId: number; nextListId: number | null } {
  const l = getList(id);
  if (!l || l.status !== "open") throw new Error("Список уже закрыт");
  if (!o.centerId) throw new Error("Выберите направление");
  const bought = l.items.filter((i) => i.bought);
  const note = (bought.length ? bought : l.items).map((i) => i.name).slice(0, 8).join(", ");
  if (o.mergeTxId) {
    // Это та же покупка, что уже пришла из банка (Apple Pay / Monobank): не создаём второй расход,
    // а дописываем в оплату направление, категорию и список товаров.
    const pay = getDb().prepare("SELECT id, amount FROM transactions WHERE id = ?").get(o.mergeTxId) as { id: number; amount: number } | undefined;
    if (!pay) throw new Error("Оплата не найдена");
    assignTx(pay.id, o.centerId, undefined, note);
    setTxDetails(pay.id, { categoryId: o.categoryId ?? null, note });
    getDb().prepare("UPDATE shopping_lists SET status = 'closed', tx_id = ?, total = ?, closed_at = ? WHERE id = ?").run(pay.id, Math.abs(Number(pay.amount)), new Date().toISOString(), id);
    return { txId: pay.id, nextListId: carry(l, o.carryOver) };
  }
  const total = o.total && o.total > 0 ? o.total : listSum(l);
  if (!(total > 0)) throw new Error("Укажите сумму чека или цены купленных товаров");
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
  return { txId, nextListId: carry(l, o.carryOver) };
}

/** Перенести некупленное в новый список. */
function carry(l: ShoppingList, on?: boolean): number | null {
  const left = l.items.filter((i) => !i.bought);
  if (!on || !left.length) return null;
  const next = createList("");
  for (const i of left) {
    getDb().prepare("INSERT INTO shopping_items (list_id, name, qty, unit, sort) VALUES (?, ?, ?, ?, ?)").run(next, i.name, i.qty, i.unit, i.sort);
  }
  return next;
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

// ---------- Чек по фото ----------

export interface ReceiptInput {
  store: string;
  date: string | null;
  total: number; // гривны
  items: { name: string; qty: number | null; unit: string; price: number; group: string }[];
}

const firstWord = (n: string) => norm(n).split(/[\s,.%]+/)[0] ?? "";

/**
 * Разложить прочитанный чек: в существующий список (цены встают к совпавшим товарам, остальное добавляется)
 * или в новый. Все товары из чека отмечаются купленными. Возвращает id списка.
 */
export function applyReceipt(r: ReceiptInput, listId?: number | null): number {
  const db = getDb();
  let id = listId ?? null;
  const existing = id ? getList(id) : null;
  if (!existing || existing.status !== "open") {
    const d = r.date ? new Date(`${r.date}T12:00:00`) : new Date();
    const title = `Чек${r.store ? ` · ${r.store}` : ""} · ${d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`;
    id = createList(title);
  }
  const listIdFinal = id!;
  const free = (existing && existing.status === "open" ? existing.items : []).filter((i) => !i.price);
  let sort = Number((db.prepare("SELECT COALESCE(MAX(sort), 0) AS m FROM shopping_items WHERE list_id = ?").get(listIdFinal) as { m: number }).m);
  for (const it of r.items) {
    const price = Math.round((it.price || 0) * 100);
    if (!it.name.trim() || price <= 0) continue;
    // Совпадение с товаром из списка: по первому слову названия («Молоко» ↔ «Молоко 2,5% 900 мл»).
    const w = firstWord(it.name);
    const match = free.find((f) => w && (firstWord(f.name) === w || norm(it.name).includes(norm(f.name)) || norm(f.name).includes(w)));
    if (match) {
      free.splice(free.indexOf(match), 1);
      db.prepare("UPDATE shopping_items SET price = ?, bought = 1, grp = ?, qty = COALESCE(qty, ?), unit = CASE WHEN unit = '' THEN ? ELSE unit END WHERE id = ?").run(
        price, it.group || "other", it.qty, it.qty ? it.unit || "шт" : "", match.id,
      );
    } else {
      db.prepare("INSERT INTO shopping_items (list_id, name, qty, unit, price, bought, grp, sort) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(
        listIdFinal, it.name.trim().slice(0, 60), it.qty, it.qty ? it.unit || "шт" : "", price, it.group || "other", ++sort,
      );
    }
  }
  db.prepare("UPDATE shopping_lists SET source = 'receipt', store = CASE WHEN store = '' THEN ? ELSE store END, receipt_date = ?, receipt_total = ? WHERE id = ?").run(
    r.store.trim().slice(0, 60), r.date, r.total > 0 ? Math.round(r.total * 100) : null, listIdFinal,
  );
  return listIdFinal;
}

/** Траты по группам товаров (мясо, молочное…) в списке. */
export function groupTotals(l: ShoppingList): { grp: string; sum: number; n: number }[] {
  const map = new Map<string, { sum: number; n: number }>();
  for (const i of l.items) {
    if (!i.bought || !i.price) continue;
    const g = i.grp || "";
    const v = map.get(g) ?? { sum: 0, n: 0 };
    v.sum += i.price;
    v.n++;
    map.set(g, v);
  }
  return [...map.entries()].map(([grp, v]) => ({ grp, ...v })).sort((a, b) => b.sum - a.sum);
}

/** Траты по группам товаров за период (по закрытым спискам). */
export function groupStats(from: string): { grp: string; sum: number; n: number }[] {
  return (
    getDb()
      .prepare(
        `SELECT i.grp AS grp, SUM(i.price) AS sum, COUNT(*) AS n FROM shopping_items i JOIN shopping_lists l ON l.id = i.list_id
         WHERE i.bought = 1 AND i.price IS NOT NULL AND l.status = 'closed' AND l.closed_at >= ? GROUP BY i.grp ORDER BY sum DESC`,
      )
      .all(from) as { grp: string; sum: number; n: number }[]
  ).map((r) => ({ grp: r.grp ?? "", sum: Number(r.sum), n: Number(r.n) }));
}

/**
 * Оплаты из банка (Apple Pay, Monobank, SMS) на ту же сумму в день чека (±2 дня), ещё не привязанные к спискам, —
 * скорее всего, это та же покупка. Предлагаем объединить, чтобы не было двух расходов.
 */
export function paymentMatches(totalKop: number, dateYmd?: string | null): { id: number; occurred_at: string; counterparty: string; card_label: string | null }[] {
  if (!(totalKop > 0)) return [];
  const center = dateYmd ? new Date(`${dateYmd}T12:00:00`) : new Date();
  const from = new Date(center.getTime() - 2.5 * 864e5).toISOString();
  const to = new Date(center.getTime() + 2.5 * 864e5).toISOString();
  return getDb()
    .prepare(
      `SELECT t.id, t.occurred_at, t.counterparty, c.bank || ' •' || c.last4 AS card_label FROM transactions t
       LEFT JOIN cards c ON c.id = t.card_id
       WHERE t.amount = ? AND t.source IN ('applepay', 'monobank', 'sms') AND t.occurred_at >= ? AND t.occurred_at < ?
         AND NOT EXISTS (SELECT 1 FROM shopping_lists l WHERE l.tx_id = t.id)
       ORDER BY t.occurred_at DESC LIMIT 5`,
    )
    .all(-totalKop, from, to) as { id: number; occurred_at: string; counterparty: string; card_label: string | null }[];
}

/**
 * Обратный порядок: чек уже записан расходом, а оплата из банка пришла позже.
 * Если сумма та же и чек был записан вручную без карты — переносим всё в оплату из банка, а ручной расход удаляем.
 * Возвращает true, если оплата прицепилась к чеку (уведомлять о ней не нужно).
 */
export function matchReceiptForTx(txId: number): boolean {
  const db = getDb();
  const tx = db.prepare("SELECT id, amount, source, occurred_at FROM transactions WHERE id = ?").get(txId) as
    | { id: number; amount: number; source: string; occurred_at: string }
    | undefined;
  if (!tx || Number(tx.amount) >= 0 || !["applepay", "monobank", "sms"].includes(tx.source)) return false;
  const at = new Date(tx.occurred_at).getTime();
  const cand = db
    .prepare(
      `SELECT l.id AS list_id, t.id AS tx_id, t.cost_center_id, t.category_id, t.description, t.assigned_at FROM shopping_lists l
       JOIN transactions t ON t.id = l.tx_id
       WHERE t.source = 'manual' AND t.card_id IS NULL AND t.cashbox_id IS NULL AND t.amount = ? AND l.closed_at >= ? AND l.closed_at < ?`,
    )
    .all(Number(tx.amount), new Date(at - 2.5 * 864e5).toISOString(), new Date(at + 2.5 * 864e5).toISOString()) as {
    list_id: number;
    tx_id: number;
    cost_center_id: number | null;
    category_id: number | null;
    description: string;
    assigned_at: string | null;
  }[];
  if (cand.length !== 1) return false; // нет или неоднозначно — не угадываем
  const c = cand[0];
  db.prepare("UPDATE transactions SET cost_center_id = ?, category_id = ?, description = ?, assigned_at = COALESCE(?, assigned_at), needs_note = 0, kind = 'expense' WHERE id = ?").run(
    c.cost_center_id, c.category_id, c.description, c.assigned_at, txId,
  );
  db.prepare("UPDATE shopping_lists SET tx_id = ? WHERE id = ?").run(txId, c.list_id);
  db.prepare("DELETE FROM transactions WHERE id = ?").run(c.tx_id);
  return true;
}
