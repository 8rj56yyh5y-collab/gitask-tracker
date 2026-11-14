import { getDb } from "./db.ts";
import { personalCenterIds } from "./repo.ts";
import { monthMoney } from "./income.ts";
import { listPlans, nextMonth, ymd } from "./plans.ts";

// «Умные» подсказки D&N 2.0: сколько можно тратить, найденные подписки, необычные траты, итог недели.

const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();

/* ---------------- Сколько можно тратить ---------------- */

export interface SafeToSpend {
  /** false — доходов в этом месяце нет и ставка не настроена: считать не из чего. */
  known: boolean;
  /** Сколько ещё можно потратить до конца месяца, копейки (может быть < 0). */
  left: number;
  /** То же на каждый оставшийся день, включая сегодня. */
  perDay: number;
  daysLeft: number;
  income: number;
  expected: number;
  spent: number;
  toPay: number;
  /** Доля потраченного от всего, что есть на месяц (0–100). */
  pct: number;
}

/**
 * Можно потратить = доходы месяца + ставки, которые ещё придут − уже потрачено − платежи до конца месяца.
 * Только личные деньги: деньги отдела и других направлений сюда не входят.
 */
export function safeToSpend(now = new Date()): SafeToSpend {
  const m = monthMoney(now);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1;
  const pool = m.income + m.expected;
  const left = pool - m.expense - m.toPay;
  return {
    known: pool > 0,
    left,
    perDay: left > 0 ? Math.floor(left / daysLeft / 100) * 100 : 0,
    daysLeft,
    income: m.income,
    expected: m.expected,
    spent: m.expense,
    toPay: m.toPay,
    pct: pool > 0 ? Math.min(100, Math.round(((m.expense + m.toPay) / pool) * 100)) : 0,
  };
}

/* ---------------- Подписки ---------------- */

export interface FoundSub {
  counterparty: string;
  /** Обычная сумма списания, копейки. */
  amount: number;
  months: number;
  last: string;
  /** Когда ждать следующее списание (YYYY-MM-DD). */
  next: string;
  category: string | null;
  centerId: number | null;
  cardId: number | null;
}

/**
 * Ищем регулярные списания, которых нет в «Платежах»: один и тот же получатель каждый месяц
 * (2–4 месяца из последних четырёх), сумма почти не меняется (±15%), не чаще ~раза в месяц.
 * Магазины с разными суммами (продукты) сюда не попадают.
 */
export function detectSubscriptions(now = new Date()): FoundSub[] {
  const since = new Date(now.getFullYear(), now.getMonth() - 4, 1).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT t.counterparty, t.amount, t.occurred_at, t.cost_center_id, t.card_id, cat.name AS category
       FROM transactions t LEFT JOIN categories cat ON cat.id = t.category_id
       WHERE t.amount < 0 AND t.kind = 'expense' AND t.counterparty != '' AND t.occurred_at >= ? AND t.plan_id IS NULL AND t.transit_id IS NULL
       ORDER BY t.occurred_at`,
    )
    .all(since) as { counterparty: string; amount: number; occurred_at: string; cost_center_id: number | null; card_id: number | null; category: string | null }[];
  const hidden = new Set((getDb().prepare("SELECT counterparty FROM subs_hidden").all() as { counterparty: string }[]).map((r) => norm(r.counterparty)));
  const planned = [...listPlans("open", 500, "out"), ...listPlans("done", 500, "out")].filter((p) => p.repeat === "month").map((p) => norm(`${p.title} ${p.payee}`));
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = norm(r.counterparty);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const out: FoundSub[] = [];
  for (const [k, list] of groups) {
    if (hidden.has(k) || planned.some((p) => p.includes(k))) continue;
    const months = new Set(list.map((r) => r.occurred_at.slice(0, 7)));
    if (months.size < 2 || list.length > months.size * 1.5) continue;
    const sums = list.map((r) => -r.amount).sort((a, b) => a - b);
    const median = sums[Math.floor(sums.length / 2)];
    if (median < 1000 || sums.some((s) => Math.abs(s - median) > median * 0.15)) continue;
    const last = list[list.length - 1];
    const d = new Date(last.occurred_at);
    // Следующее списание — тот же день через месяц; если эта дата уже прошла, — ещё через месяц.
    let next = ymd(new Date(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    const todayYmd = ymd(now);
    while (next < todayYmd) next = nextMonth(next);
    // Последнее списание было больше 40 дней назад — подписку, похоже, уже отменили.
    if (now.getTime() - d.getTime() > 40 * 864e5) continue;
    out.push({ counterparty: last.counterparty, amount: median, months: months.size, last: last.occurred_at, next, category: last.category, centerId: last.cost_center_id, cardId: last.card_id });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

export function hideSubscription(counterparty: string) {
  getDb().prepare("INSERT OR IGNORE INTO subs_hidden (counterparty) VALUES (?)").run(counterparty.trim());
}

/* ---------------- Необычные траты ---------------- */

export interface Unusual {
  categoryId: number;
  name: string;
  emoji: string;
  now: number;
  usual: number;
  /** На сколько процентов больше обычного. */
  pct: number;
}

/**
 * Категории, где с начала месяца потрачено заметно больше обычного: сравниваем с теми же днями
 * трёх прошлых месяцев (1-е … сегодняшнее число), чтобы начало месяца не пугало ложными тревогами.
 * Только личные деньги.
 */
export function unusualSpending(now = new Date()): Unusual[] {
  const ids = personalCenterIds();
  if (!ids.length) return [];
  const day = now.getDate();
  const span = (monthsBack: number) => {
    const from = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const last = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 0).getDate();
    const to = new Date(now.getFullYear(), now.getMonth() - monthsBack, Math.min(day, last) + 1);
    return [from.toISOString(), to.toISOString()];
  };
  const q = getDb().prepare(
    `SELECT t.category_id AS id, cat.name, cat.emoji, SUM(-t.amount) AS s FROM transactions t JOIN categories cat ON cat.id = t.category_id
     WHERE t.kind = 'expense' AND t.cost_center_id IN (${ids.join(",")}) AND t.occurred_at >= ? AND t.occurred_at < ? GROUP BY t.category_id`,
  );
  type R = { id: number; name: string; emoji: string; s: number };
  const cur = q.all(...span(0)) as R[];
  const prev = [1, 2, 3].map((b) => new Map((q.all(...span(b)) as R[]).map((r) => [Number(r.id), Number(r.s)])));
  const withData = prev.filter((m) => m.size > 0);
  if (!withData.length) return [];
  const out: Unusual[] = [];
  for (const r of cur) {
    const usual = withData.reduce((a, m) => a + (m.get(Number(r.id)) ?? 0), 0) / withData.length;
    const s = Number(r.s);
    if (usual <= 0 || s < usual * 1.4 || s - usual < 50000) continue;
    out.push({ categoryId: Number(r.id), name: r.name, emoji: r.emoji, now: s, usual: Math.round(usual), pct: Math.round((s / usual - 1) * 100) });
  }
  return out.sort((a, b) => b.now - b.usual - (a.now - a.usual)).slice(0, 3);
}

/* ---------------- Итог недели ---------------- */

export interface WeekSummary {
  spent: number;
  prevSpent: number;
  count: number;
  top: { name: string; emoji: string; s: number }[];
  biggest: { counterparty: string; amount: number } | null;
}

/** Личные траты за прошедшие 7 дней (до начала сегодняшнего дня) и сравнение с неделей до них. */
export function weekSummary(now = new Date()): WeekSummary {
  const ids = personalCenterIds();
  const P = ids.length ? ids.join(",") : "NULL";
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end.getTime() - 7 * 864e5);
  const prevStart = new Date(end.getTime() - 14 * 864e5);
  const db = getDb();
  const sum = (a: Date, b: Date) =>
    db
      .prepare(`SELECT COALESCE(SUM(-amount), 0) AS s, COUNT(*) AS n FROM transactions WHERE kind = 'expense' AND cost_center_id IN (${P}) AND occurred_at >= ? AND occurred_at < ?`)
      .get(a.toISOString(), b.toISOString()) as { s: number; n: number };
  const cur = sum(start, end);
  const prev = sum(prevStart, start);
  const top = db
    .prepare(
      `SELECT COALESCE(cat.name, 'Без категории') AS name, COALESCE(cat.emoji, '•') AS emoji, SUM(-t.amount) AS s FROM transactions t LEFT JOIN categories cat ON cat.id = t.category_id
       WHERE t.kind = 'expense' AND t.cost_center_id IN (${P}) AND t.occurred_at >= ? AND t.occurred_at < ? GROUP BY t.category_id ORDER BY s DESC LIMIT 3`,
    )
    .all(start.toISOString(), end.toISOString()) as { name: string; emoji: string; s: number }[];
  const big = db
    .prepare(`SELECT counterparty, -amount AS big FROM transactions WHERE kind = 'expense' AND cost_center_id IN (${P}) AND occurred_at >= ? AND occurred_at < ? ORDER BY big DESC LIMIT 1`)
    .get(start.toISOString(), end.toISOString()) as { counterparty: string; big: number } | undefined;
  return {
    spent: Number(cur.s),
    prevSpent: Number(prev.s),
    count: Number(cur.n),
    top: top.map((t) => ({ ...t, s: Number(t.s) })),
    biggest: big ? { counterparty: big.counterparty, amount: Number(big.big) } : null,
  };
}


/* ---------------- Серия: сколько дней подряд всё записано ---------------- */

/**
 * Дни подряд (до сегодня включительно), когда все траты записаны: у каждой есть направление и комментарий.
 * Дни без трат серию не рвут и не считаются. Сегодня с неразобранным — серия считается до вчера.
 */
export function streakDays(now = new Date()): number {
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
  const rows = getDb()
    .prepare(
      `SELECT occurred_at, (cost_center_id IS NULL AND kind != 'internal' AND income_kind IS NULL) OR needs_note = 1 AS pending
       FROM transactions WHERE occurred_at >= ? AND amount < 0`,
    )
    .all(since.toISOString()) as { occurred_at: string; pending: number }[];
  const days = new Map<string, boolean>();
  for (const r of rows) {
    const k = ymd(new Date(r.occurred_at));
    days.set(k, (days.get(k) ?? false) || Boolean(Number(r.pending)));
  }
  let n = 0;
  for (let i = 0; i <= 90; i++) {
    const k = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
    if (!days.has(k)) continue;
    if (days.get(k)) {
      if (i === 0) continue; // сегодня ещё можно разобрать
      break;
    }
    n++;
  }
  return n;
}

/** «Доброе утро» / «Добрый день» / «Добрый вечер» / «Доброй ночи». */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
}
