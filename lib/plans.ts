import { getDb } from "./db.ts";
import { insertTx } from "./repo.ts";

// Запланированные платежи («я плачу») и ожидаемые поступления («мне должны»), с оплатой частями.
// Оплачено = сумма операций с plan_id (для «я плачу» — расходы, для «мне должны» — поступления).
// Когда оплачено всё — закрыт; ежемесячный создаёт следующий.

export interface Plan {
  id: number;
  title: string;
  payee: string;
  total: number;
  due_date: string | null;
  card_id: number | null;
  cashbox_id: number | null;
  cost_center_id: number | null;
  note: string;
  repeat: "none" | "month";
  direction: "out" | "in";
  status: "open" | "done" | "cancelled";
  reminded_on: string | null;
  created_at: string;
  done_at: string | null;
  /** Сколько уже оплачено, копейки. */
  paid: number;
}

type Row = Record<string, unknown>;
const SELECT = `SELECT p.*, COALESCE((SELECT SUM(CASE WHEN p.direction = 'in' THEN t.amount ELSE -t.amount END) FROM transactions t WHERE t.plan_id = p.id), 0) AS paid FROM plans p`;

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function listPlans(status: "open" | "done" = "open", limit = 200, direction?: "out" | "in"): Plan[] {
  const order = status === "open" ? "p.due_date IS NULL, p.due_date ASC, p.id" : "p.done_at DESC";
  const dir = direction ? " AND p.direction = ?" : "";
  const args: (string | number)[] = direction ? [status, direction, limit] : [status, limit];
  return getDb().prepare(`${SELECT} WHERE p.status = ?${dir} ORDER BY ${order} LIMIT ?`).all(...args) as unknown as Plan[];
}

export function getPlan(id: number): Plan | null {
  return (getDb().prepare(`${SELECT} WHERE p.id = ?`).get(id) as unknown as Plan) ?? null;
}

export interface NewPlan {
  title: string;
  payee?: string;
  total: number;
  dueDate?: string | null;
  cardId?: number | null;
  cashboxId?: number | null;
  centerId?: number | null;
  note?: string;
  repeat?: "none" | "month";
  direction?: "out" | "in";
}

export function createPlan(p: NewPlan): number {
  if (!p.title.trim()) throw new Error("Напишите название");
  if (!(p.total > 0)) throw new Error("Укажите сумму");
  const r = getDb()
    .prepare("INSERT INTO plans (title, payee, total, due_date, card_id, cashbox_id, cost_center_id, note, repeat, direction) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(p.title.trim(), p.payee ?? "", p.total, p.dueDate || null, p.cardId ?? null, p.cashboxId ?? null, p.centerId ?? null, p.note ?? "", p.repeat ?? "none", p.direction ?? "out");
  return Number(r.lastInsertRowid);
}

export function updatePlan(id: number, p: NewPlan) {
  getDb()
    .prepare("UPDATE plans SET title = ?, payee = COALESCE(?, payee), total = ?, due_date = ?, card_id = ?, cashbox_id = ?, cost_center_id = ?, note = ?, repeat = ? WHERE id = ?")
    .run(p.title.trim(), p.payee ?? null, p.total, p.dueDate || null, p.cardId ?? null, p.cashboxId ?? null, p.centerId ?? null, p.note ?? "", p.repeat ?? "none", id);
  refreshStatus(id);
}

export function cancelPlan(id: number) {
  getDb().prepare("UPDATE plans SET status = 'cancelled', done_at = ? WHERE id = ?").run(new Date().toISOString(), id);
}

/** Та же дата в следующем месяце (31 января → 28/29 февраля). */
export function nextMonth(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(y, m + 1, 0).getDate();
  return ymd(new Date(y, m, Math.min(d, last)));
}

/** Закрывает платёж, если оплачено всё; для ежемесячного создаёт следующий. */
function refreshStatus(id: number): Plan | null {
  const p = getPlan(id);
  if (!p || p.status !== "open" || p.paid < p.total) return p;
  getDb().prepare("UPDATE plans SET status = 'done', done_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  if (p.repeat === "month") {
    createPlan({
      title: p.title, payee: p.payee, total: p.total, dueDate: p.due_date ? nextMonth(p.due_date) : null,
      cardId: p.card_id, cashboxId: p.cashbox_id, centerId: p.cost_center_id, note: p.note, repeat: "month", direction: p.direction,
    });
  }
  return getPlan(id);
}

/** Оплатить платёж (целиком или часть): записывает расход с карты или из кассы. */
export function payPlan(id: number, amountKop: number, from: { cardId?: number | null; cashboxId?: number | null; at?: string } = {}): number {
  const p = getPlan(id);
  if (!p || p.status !== "open") throw new Error("Платёж уже закрыт");
  if (!(amountKop > 0)) throw new Error("Укажите сумму");
  const tx = insertTx({
    amountKop: p.direction === "in" ? amountKop : -amountKop,
    cardId: from.cardId ?? null,
    cashboxId: from.cashboxId ?? null,
    costCenterId: p.cost_center_id,
    counterparty: p.payee || p.title,
    description: p.payee ? p.title : "",
    occurredAt: from.at,
    planId: id,
    source: "manual",
  });
  refreshStatus(id);
  return tx.id;
}

/**
 * Новая операция из банка (Monobank, Apple Pay, SMS) на ту же сумму, что остаток открытого платежа,
 * около даты платежа — значит, это он: связываем, проставляем категорию, закрываем платёж.
 * Возвращает id платежа или null.
 */
export function matchPlanForTx(txId: number): number | null {
  const db = getDb();
  const tx = db.prepare("SELECT t.*, c.parent_id AS card_parent FROM transactions t LEFT JOIN cards c ON c.id = t.card_id WHERE t.id = ?").get(txId) as Row | undefined;
  if (!tx || Number(tx.amount) === 0 || tx.plan_id || tx.kind === "internal") return null;
  const direction = Number(tx.amount) < 0 ? "out" : "in";
  const amount = Math.abs(Number(tx.amount));
  const at = new Date(String(tx.occurred_at));
  const candidates = listPlans("open", 500, direction).filter((p) => {
    if (p.total - p.paid !== amount || !p.due_date) return false;
    const due = new Date(`${p.due_date}T12:00:00`);
    const days = (at.getTime() - due.getTime()) / 864e5;
    if (days < -4 || days > 10) return false; // оплатили не раньше чем за 3 дня и не позже чем через 10
    if (p.card_id && tx.card_id && p.card_id !== Number(tx.card_id) && p.card_id !== Number(tx.card_parent)) return false;
    return true;
  });
  if (candidates.length !== 1) return null; // нет или неоднозначно — не угадываем
  const p = candidates[0];
  db.prepare("UPDATE transactions SET plan_id = ?, cost_center_id = COALESCE(cost_center_id, ?), assigned_at = COALESCE(assigned_at, ?) WHERE id = ?").run(
    p.id, p.cost_center_id, p.cost_center_id ? new Date().toISOString() : null, txId,
  );
  refreshStatus(p.id);
  return p.id;
}

/** Платежи, о которых пора напомнить сегодня (срок наступил, сегодня ещё не напоминали). */
export function plansToRemind(today = new Date()): Plan[] {
  const d = ymd(today);
  return listPlans("open", 500, "out").filter((p) => p.due_date && p.due_date <= d && p.reminded_on !== d);
}

export function markReminded(id: number, today = new Date()) {
  getDb().prepare("UPDATE plans SET reminded_on = ? WHERE id = ?").run(ymd(today), id);
}
