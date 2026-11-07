import { getDb } from "./db.ts";
import { insertTx, internalCenterId } from "./repo.ts";

// Кассы (наличные): у каждой свой остаток. Движения кассы — обычные операции с cashbox_id.

export interface Cashbox {
  id: number;
  name: string;
  owner: string;
  color: string;
  opening: number;
  archived: number;
  /** Категория по умолчанию для расходов из кассы. */
  center_id: number | null;
}

type Row = Record<string, unknown>;

export function listCashboxes(): Cashbox[] {
  return getDb().prepare("SELECT * FROM cashboxes WHERE archived = 0 ORDER BY id").all() as unknown as Cashbox[];
}

export function getCashbox(id: number): Cashbox | null {
  return (getDb().prepare("SELECT * FROM cashboxes WHERE id = ?").get(id) as unknown as Cashbox) ?? null;
}

export function createCashbox(c: { name: string; owner?: string; color?: string; opening?: number; centerId?: number | null }): number {
  const r = getDb()
    .prepare("INSERT INTO cashboxes (name, owner, color, opening, center_id) VALUES (?, ?, ?, ?, ?)")
    .run(c.name, c.owner ?? "", c.color ?? "#16a34a", c.opening ?? 0, c.centerId ?? null);
  return Number(r.lastInsertRowid);
}

export function updateCashbox(id: number, c: { name: string; owner: string; color: string; opening: number; centerId?: number | null }) {
  getDb()
    .prepare("UPDATE cashboxes SET name = ?, owner = ?, color = ?, opening = ?, center_id = ? WHERE id = ?")
    .run(c.name, c.owner, c.color, c.opening, c.centerId ?? null, id);
}

export function archiveCashbox(id: number) {
  getDb().prepare("UPDATE cashboxes SET archived = 1 WHERE id = ?").run(id);
}

/** Остатки всех касс: начальный остаток + все приходы и расходы. */
export function cashBalances(): Map<number, number> {
  const rows = getDb()
    .prepare("SELECT b.id, b.opening + COALESCE(SUM(t.amount), 0) AS bal FROM cashboxes b LEFT JOIN transactions t ON t.cashbox_id = b.id GROUP BY b.id")
    .all() as Row[];
  return new Map(rows.map((r) => [Number(r.id), Number(r.bal)]));
}

export interface CashMove {
  amountKop: number; // со знаком: + приход, − расход
  note?: string;
  counterparty?: string;
  centerId?: number | null;
  at?: string;
  planId?: number | null;
}

/**
 * Приход или расход кассы. Расход без выбранной категории идёт в категорию кассы;
 * если и у кассы её нет — попадёт в «Нужно записать», как любая операция.
 */
export function cashMove(cashboxId: number, m: CashMove): number {
  const boxCenter = m.amountKop < 0 && m.centerId == null ? (getCashbox(cashboxId)?.center_id ?? null) : null;
  return insertTx({
    amountKop: m.amountKop,
    cashboxId,
    costCenterId: m.centerId ?? boxCenter,
    counterparty: m.counterparty ?? "",
    description: m.note ?? "",
    occurredAt: m.at,
    planId: m.planId ?? null,
    source: "manual",
  }).id;
}

export type Account = { card: number } | { cashbox: number };

/** Перевод между кассами и картами: две операции «внутренний перевод», не расход и не доход. */
export function transfer(from: Account, to: Account, amountKop: number, note = "", at?: string): [number, number] {
  if (amountKop <= 0) throw new Error("Сумма перевода должна быть больше нуля");
  const center = internalCenterId();
  const base = { kind: "internal" as const, costCenterId: center, description: note, occurredAt: at, source: "manual" };
  const a = insertTx({ ...base, amountKop: -amountKop, ...side(from), counterparty: "Перевод" });
  const b = insertTx({ ...base, amountKop, ...side(to), counterparty: "Перевод" });
  return [a.id, b.id];
}

function side(a: Account) {
  return "card" in a ? { cardId: a.card, cashboxId: null } : { cardId: null, cashboxId: a.cashbox };
}

/** «card:5» / «cash:2» → счёт (для форм). */
export function parseAccount(v: string): Account | null {
  const m = String(v || "").match(/^(card|cash):(\d+)$/);
  if (!m) return null;
  return m[1] === "card" ? { card: Number(m[2]) } : { cashbox: Number(m[2]) };
}
