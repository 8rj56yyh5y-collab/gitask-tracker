import { getDb } from "./db.ts";
import { insertTx, monthBounds, monobankConnected, personalCenterIds } from "./repo.ts";
import { createPlan, listPlans, payPlan, ymd, type Plan } from "./plans.ts";

// Доходы: «ставка» — регулярный доход в определённое число месяца (это ежемесячный план «мне придёт»),
// и прочие доходы — мотивация, премии, подработка. Плюс итог месяца: доходы минус расходы.

/** Число месяца → ближайшая дата с этим числом, начиная с сегодня. */
export function nextPayday(day: number, today = new Date()): string {
  const d = Math.min(Math.max(1, Math.round(day)), 31);
  for (let add = 0; add < 2; add++) {
    const y = today.getFullYear();
    const m = today.getMonth() + add;
    const last = new Date(y, m + 1, 0).getDate();
    const date = new Date(y, m, Math.min(d, last));
    if (ymd(date) >= ymd(today)) return ymd(date);
  }
  return ymd(today);
}

export interface NewSalary {
  title: string;
  /** От кого (компания, работодатель). */
  payer?: string;
  amountKop: number;
  day: number;
  cardId?: number | null;
  cashboxId?: number | null;
  centerId?: number | null;
  auto?: boolean;
}

export function createSalary(s: NewSalary, today = new Date()): number {
  return createPlan({
    title: s.title || "Ставка",
    payee: s.payer ?? "",
    total: s.amountKop,
    dueDate: nextPayday(s.day, today),
    cardId: s.cardId ?? null,
    cashboxId: s.cashboxId ?? null,
    centerId: s.centerId ?? null,
    repeat: "month",
    direction: "in",
    kind: "salary",
    auto: s.auto ?? false,
  });
}

/** Открытые регулярные доходы (по одному на каждую «ставку» — ближайшая выплата). */
export function listSalaries(): Plan[] {
  return listPlans("open", 200, "in").filter((p) => p.kind === "salary");
}

/**
 * Если ставка зачисляется на карту Monobank, банк сам пришлёт поступление и D&N его отметит.
 * Автоматически зачисляем только то, что банк не пришлёт (касса, другие карты) — иначе будет два дохода.
 */
export function canAutoCredit(p: Pick<Plan, "card_id">): boolean {
  if (!p.card_id) return true;
  const c = getDb().prepare("SELECT mono_account_id FROM cards WHERE id = ?").get(p.card_id) as { mono_account_id: string | null } | undefined;
  return !(c?.mono_account_id && monobankConnected());
}

/** Зачислить ставки, у которых наступил день и включено «зачислять автоматически». Возвращает сколько. */
export function creditDueSalaries(now = new Date()): number {
  const today = ymd(now);
  let n = 0;
  for (const p of listSalaries()) {
    if (!p.auto || !p.due_date || p.due_date > today || !canAutoCredit(p)) continue;
    payPlan(p.id, p.total - p.paid, { cardId: p.card_id, cashboxId: p.cashbox_id, at: new Date(`${p.due_date}T09:00:00`).toISOString() });
    n++;
  }
  return n;
}

export const OTHER_INCOME_KINDS = ["Мотивация", "Премия", "Подработка", "Подарок", "Возврат", "Другое"];

export function addOtherIncome(i: {
  amountKop: number;
  title: string;
  cardId?: number | null;
  cashboxId?: number | null;
  centerId?: number | null;
  note?: string;
  at?: string;
}): number {
  if (!(i.amountKop > 0)) throw new Error("Укажите сумму");
  const id = insertTx({
    amountKop: i.amountKop,
    kind: "income",
    cardId: i.cardId ?? null,
    cashboxId: i.cashboxId ?? null,
    costCenterId: i.centerId ?? null,
    counterparty: i.title || "Другое",
    description: i.note ?? "",
    occurredAt: i.at,
    source: "manual",
  }).id;
  // Доход без направления не должен висеть в «Без направления»: это просто деньги пришли.
  getDb().prepare("UPDATE transactions SET income_kind = 'other', assigned_at = COALESCE(assigned_at, ?) WHERE id = ?").run(new Date().toISOString(), id);
  return id;
}

export interface MonthMoney {
  /** Мои доходы за месяц, копейки. */
  income: number;
  salary: number;
  other: number;
  /** Мои расходы за месяц, копейки (положительное число). */
  expense: number;
  /** Доходы − расходы. */
  net: number;
  /** Ставки, которые ещё придут в этом месяце. */
  expected: number;
  /** Мои запланированные платежи, которые ещё нужно оплатить в этом месяце. */
  toPay: number;
  /** Названия личных направлений (пусто — ни одно не отмечено). */
  personal: string[];
  /** Операции месяца без направления — пока не учтены. */
  unsorted: number;
}

const inList = (ids: number[]) => (ids.length ? ids.join(",") : "NULL");

/**
 * «Мои деньги за месяц»: только личное. Деньги отдела, руководителя и т.п. — не мои,
 * их видно в направлениях и кассах, но в мой плюс/минус они не входят.
 * Доход без направления (ставка, премия) — мой; расход — только в личных направлениях.
 */
export function monthMoney(today = new Date()): MonthMoney {
  const { from, to } = monthBounds(today);
  const ids = personalCenterIds();
  const P = inList(ids);
  const mineIncome = `kind = 'income' AND (cost_center_id IN (${P}) OR (cost_center_id IS NULL AND income_kind IS NOT NULL))`;
  const r = getDb()
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN ${mineIncome} THEN amount END), 0) AS income,
         COALESCE(SUM(CASE WHEN ${mineIncome} AND income_kind = 'salary' THEN amount END), 0) AS salary,
         COALESCE(SUM(CASE WHEN kind = 'expense' AND cost_center_id IN (${P}) THEN -amount END), 0) AS expense,
         COALESCE(SUM(CASE WHEN kind != 'internal' AND cost_center_id IS NULL AND income_kind IS NULL THEN 1 END), 0) AS unsorted
       FROM transactions WHERE occurred_at >= ? AND occurred_at < ? AND transit_id IS NULL`,
    )
    .get(from, to) as Record<string, number>;
  const monthEnd = ymd(new Date(new Date(to).getTime() - 1));
  const left = (p: Plan) => p.total - p.paid;
  const boxCenter = new Map(
    (getDb().prepare("SELECT id, center_id FROM cashboxes").all() as { id: number; center_id: number | null }[]).map((b) => [b.id, b.center_id]),
  );
  const mine = (centerId: number | null, cashboxId: number | null) => {
    const c = centerId ?? (cashboxId ? boxCenter.get(cashboxId) ?? null : null);
    return c !== null && ids.includes(c);
  };
  const expected = listSalaries()
    .filter((p) => p.due_date && p.due_date <= monthEnd && (p.cost_center_id === null || ids.includes(p.cost_center_id)))
    .reduce((a, p) => a + left(p), 0);
  const toPay = listPlans("open", 500, "out")
    .filter((p) => p.due_date && p.due_date <= monthEnd && mine(p.cost_center_id, p.cashbox_id))
    .reduce((a, p) => a + left(p), 0);
  const names = ids.length
    ? (getDb().prepare(`SELECT name FROM cost_centers WHERE is_personal = 1 AND archived = 0 ORDER BY name`).all() as { name: string }[]).map((x) => x.name)
    : [];
  const income = Number(r.income);
  const salary = Number(r.salary);
  const expense = Number(r.expense);
  return { income, salary, other: income - salary, expense, net: income - expense, expected, toPay, personal: names, unsorted: Number(r.unsorted) };
}

/** Доходы за месяц списком. */
export function monthIncomes(today = new Date()) {
  const { from, to } = monthBounds(today);
  return getDb()
    .prepare(
      `SELECT t.id, t.occurred_at, t.amount, t.counterparty, t.description, t.income_kind, t.source,
              c.bank || ' •••• ' || c.last4 AS card_label, cb.name AS cashbox_name
       FROM transactions t LEFT JOIN cards c ON c.id = t.card_id LEFT JOIN cashboxes cb ON cb.id = t.cashbox_id
       WHERE t.kind = 'income' AND t.occurred_at >= ? AND t.occurred_at < ? AND t.transit_id IS NULL
         AND (t.cost_center_id IN (${inList(personalCenterIds())}) OR (t.cost_center_id IS NULL AND t.income_kind IS NOT NULL))
       ORDER BY t.occurred_at DESC`,
    )
    .all(from, to) as {
    id: number; occurred_at: string; amount: number; counterparty: string; description: string;
    income_kind: string | null; source: string; card_label: string | null; cashbox_name: string | null;
  }[];
}
