import { getDb } from "./db.ts";
import { insertTx, internalCenterId, monthBounds } from "./repo.ts";
import { parseTiers, priceFor, splitSale, type Tier } from "./pricing.ts";

// Продажи товара компании: деньги приходят вам, но это деньги компании.
// Ваш доход — комиссия отдела продаж; долг компании = доли компании − переданное компании.

export interface ProductGroup { id: number; name: string; sales_rate: number; mp_rate: number; archived: number }
export interface Product { id: number; name: string; group_id: number | null; unit: string; tiers: string; archived: number; tierList: Tier[] }
export interface Sale {
  id: number; at: string; product_id: number | null; product_name: string; qty: number; total: number; channel: "direct" | "mp";
  sales_rate: number; mp_rate: number; mp_fee: number; commission: number; company_share: number; tx_id: number | null; note: string;
}

type Row = Record<string, unknown>;

export function listGroups(): ProductGroup[] {
  return getDb().prepare("SELECT * FROM product_groups WHERE archived = 0 ORDER BY name").all() as unknown as ProductGroup[];
}
export function saveGroup(g: { id?: number | null; name: string; sales_rate: number; mp_rate: number }): number {
  const db = getDb();
  if (g.id) {
    db.prepare("UPDATE product_groups SET name = ?, sales_rate = ?, mp_rate = ? WHERE id = ?").run(g.name, g.sales_rate, g.mp_rate, g.id);
    return g.id;
  }
  return Number(db.prepare("INSERT INTO product_groups (name, sales_rate, mp_rate) VALUES (?, ?, ?)").run(g.name, g.sales_rate, g.mp_rate).lastInsertRowid);
}
export function archiveGroup(id: number) {
  getDb().prepare("UPDATE product_groups SET archived = 1 WHERE id = ?").run(id);
}

const withTiers = (p: Product): Product => {
  let list: Tier[] = [];
  try { list = JSON.parse(p.tiers); } catch { list = []; }
  return { ...p, tierList: Array.isArray(list) ? list : [] };
};
export function listProducts(): Product[] {
  return (getDb().prepare("SELECT * FROM products WHERE archived = 0 ORDER BY name").all() as unknown as Product[]).map(withTiers);
}
export function getProduct(id: number): Product | null {
  const p = getDb().prepare("SELECT * FROM products WHERE id = ?").get(id) as unknown as Product | undefined;
  return p ? withTiers(p) : null;
}
export function saveProduct(p: { id?: number | null; name: string; group_id: number | null; unit: string; tiersText: string }): number {
  const db = getDb();
  const tiers = JSON.stringify(parseTiers(p.tiersText));
  if (p.id) {
    db.prepare("UPDATE products SET name = ?, group_id = ?, unit = ?, tiers = ? WHERE id = ?").run(p.name, p.group_id, p.unit, tiers, p.id);
    return p.id;
  }
  return Number(db.prepare("INSERT INTO products (name, group_id, unit, tiers) VALUES (?, ?, ?, ?)").run(p.name, p.group_id, p.unit, tiers).lastInsertRowid);
}
export function archiveProduct(id: number) {
  getDb().prepare("UPDATE products SET archived = 1 WHERE id = ?").run(id);
}

export function salesBase(): "gross" | "net" {
  const r = getDb().prepare("SELECT value FROM settings WHERE key = 'sales_base'").get() as { value: string } | undefined;
  return r?.value === "net" ? "net" : "gross";
}
export function setSalesBase(v: "gross" | "net") {
  getDb().prepare("INSERT INTO settings (key, value) VALUES ('sales_base', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(v);
}

export interface NewSale {
  productId: number;
  qty: number;
  /** Своя цена (скидка, торг); без неё — по наборам товара. */
  total?: number | null;
  channel: "direct" | "mp";
  /** Куда пришли деньги: карта или касса; без них — продажа без поступления. */
  cardId?: number | null;
  cashboxId?: number | null;
  /** Уже записанное поступление (например, пришло в Monobank) — привязать вместо новой операции. */
  txId?: number | null;
  at?: string;
  note?: string;
}

/** Расчёт продажи без записи — для предпросмотра. */
export function quoteSale(productId: number, qty: number, channel: "direct" | "mp", customTotal?: number | null) {
  const product = getProduct(productId);
  if (!product) throw new Error("Товар не найден");
  const group = product.group_id ? (getDb().prepare("SELECT * FROM product_groups WHERE id = ?").get(product.group_id) as unknown as ProductGroup) : null;
  const price = priceFor(qty, product.tierList);
  const total = customTotal && customTotal > 0 ? customTotal : (price?.total ?? 0);
  const salesRate = group?.sales_rate ?? 0;
  const mpRate = group?.mp_rate ?? 0;
  return { product, group, price, total, salesRate, mpRate, ...splitSale(total, salesRate, mpRate, channel, salesBase()) };
}

export function createSale(s: NewSale): number {
  if (!(s.qty > 0)) throw new Error("Укажите количество");
  const q = quoteSale(s.productId, s.qty, s.channel, s.total);
  if (!(q.total > 0)) throw new Error("У товара нет цены — укажите цену в каталоге или сумму продажи");
  const db = getDb();
  const at = s.at ?? new Date().toISOString();
  const name = `${q.product.name} × ${s.qty} ${q.product.unit}`;
  const sale = db
    .prepare(
      `INSERT INTO sales (at, product_id, product_name, qty, total, channel, sales_rate, mp_rate, mp_fee, commission, company_share, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(at, q.product.id, q.product.name, s.qty, q.total, s.channel, q.salesRate, q.mpRate, q.mpFee, q.commission, q.company, s.note ?? "");
  const saleId = Number(sale.lastInsertRowid);
  let txId: number | null = null;
  if (s.txId) {
    // Деньги уже пришли (например, Monobank прислал поступление) — это не ваш доход, а продажа.
    db.prepare("UPDATE transactions SET kind = 'internal', sale_id = ?, cost_center_id = ?, assigned_at = ?, counterparty = COALESCE(NULLIF(counterparty, ''), ?) WHERE id = ?").run(
      saleId, internalCenterId(), new Date().toISOString(), `Продажа: ${name}`, s.txId,
    );
    txId = s.txId;
  } else if (s.cardId || s.cashboxId) {
    txId = insertTx({
      amountKop: q.total, kind: "internal", costCenterId: internalCenterId(), cardId: s.cardId ?? null, cashboxId: s.cashboxId ?? null,
      counterparty: `Продажа: ${name}`, description: s.note ?? "", occurredAt: at, saleId, source: "manual",
    }).id;
  }
  if (txId) db.prepare("UPDATE sales SET tx_id = ? WHERE id = ?").run(txId, saleId);
  return saleId;
}

export function deleteSale(id: number) {
  const db = getDb();
  const s = db.prepare("SELECT tx_id FROM sales WHERE id = ?").get(id) as Row | undefined;
  if (s?.tx_id) db.prepare("DELETE FROM transactions WHERE id = ? AND source = 'manual'").run(Number(s.tx_id));
  db.prepare("UPDATE transactions SET sale_id = NULL, kind = 'income', cost_center_id = NULL, assigned_at = NULL WHERE sale_id = ?").run(id);
  db.prepare("DELETE FROM sales WHERE id = ?").run(id);
}

/** Сколько вы должны компании сейчас: все доли компании минус переданное. */
export function companyDebt(): number {
  const db = getDb();
  const owed = Number((db.prepare("SELECT COALESCE(SUM(company_share), 0) AS s FROM sales").get() as Row).s);
  const paid = Number((db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM company_payments").get() as Row).s);
  return owed - paid;
}

/** Передать деньги компании: расход-перевод с карты или из кассы (не ваш расход), долг уменьшается. */
export function payCompany(amountKop: number, from: { cardId?: number | null; cashboxId?: number | null }, note = "", at?: string): number {
  if (!(amountKop > 0)) throw new Error("Укажите сумму");
  const when = at ?? new Date().toISOString();
  const tx = from.cardId || from.cashboxId
    ? insertTx({ amountKop: -amountKop, kind: "internal", costCenterId: internalCenterId(), cardId: from.cardId ?? null, cashboxId: from.cashboxId ?? null, counterparty: "Передано компании", description: note, occurredAt: when, source: "manual" }).id
    : null;
  return Number(getDb().prepare("INSERT INTO company_payments (at, amount, tx_id, note) VALUES (?, ?, ?, ?)").run(when, amountKop, tx, note).lastInsertRowid);
}

export interface SalesMonth {
  list: Sale[];
  total: number; mpFee: number; commission: number; company: number; handed: number;
  byProduct: { name: string; qty: number; total: number; commission: number }[];
}

export function salesMonth(d = new Date()): SalesMonth {
  const { from, to } = monthBounds(d);
  const db = getDb();
  const list = db.prepare("SELECT * FROM sales WHERE at >= ? AND at < ? ORDER BY at DESC").all(from, to) as unknown as Sale[];
  const sum = (f: keyof Sale) => list.reduce((a, s) => a + Number(s[f] || 0), 0);
  const handed = Number((db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM company_payments WHERE at >= ? AND at < ?").get(from, to) as Row).s);
  const byP = new Map<string, { name: string; qty: number; total: number; commission: number }>();
  for (const s of list) {
    const x = byP.get(s.product_name) ?? { name: s.product_name, qty: 0, total: 0, commission: 0 };
    x.qty += s.qty; x.total += s.total; x.commission += s.commission;
    byP.set(s.product_name, x);
  }
  return { list, total: sum("total"), mpFee: sum("mp_fee"), commission: sum("commission"), company: sum("company_share"), handed, byProduct: [...byP.values()].sort((a, b) => b.total - a.total) };
}

export function getSale(id: number): Sale | null {
  return (getDb().prepare("SELECT * FROM sales WHERE id = ?").get(id) as unknown as Sale) ?? null;
}
