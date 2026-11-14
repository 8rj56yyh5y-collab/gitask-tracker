import { getDb } from "./db.ts";
import { getSetting, setSetting } from "./settings.ts";
import { listPlans, nextMonth, ymd } from "./plans.ts";
import { personalCenterIds } from "./repo.ts";
import { cashBalances, listCashboxes } from "./cash.ts";

// Прогноз денег на 30 дней: сколько будет по дням с учётом зарплаты, платежей и обычных трат.

export interface ForecastEvent {
  date: string;
  title: string;
  amount: number;
}
export interface ForecastDay {
  date: string;
  balance: number;
  events: ForecastEvent[];
}
export interface Forecast {
  start: number;
  startKnown: boolean;
  perDay: number;
  days: ForecastDay[];
  end: number;
  min: ForecastDay;
  /** Первый день, когда денег станет меньше нуля. */
  shortDay: ForecastDay | null;
}

/** Сколько денег «сейчас всего» — человек вводит сам; по умолчанию — наличные в кассах. */
export function forecastStart(): { amount: number; known: boolean } {
  const v = getSetting("fc_start");
  const at = getSetting("fc_start_at");
  if (v !== null && at) {
    // Введённая сумма устаревает: вычитаем мои траты и прибавляем доходы с момента ввода.
    const ids = personalCenterIds();
    const scope = ids.length ? ` AND (cost_center_id IS NULL OR cost_center_id IN (${ids.join(",")}))` : "";
    const r = getDb()
      .prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE kind != 'internal' AND transit_id IS NULL AND occurred_at >= ?${scope}`)
      .get(at) as { s: number };
    return { amount: Number(v) + Number(r.s), known: true };
  }
  const bal = cashBalances();
  return { amount: listCashboxes().reduce((a, b) => a + (bal.get(b.id) ?? 0), 0), known: false };
}

export function setForecastStart(kop: number | null) {
  setSetting("fc_start", kop === null ? null : String(Math.round(kop)));
  setSetting("fc_start_at", kop === null ? null : new Date().toISOString());
}

/** Обычные траты в день: мои расходы за 60 дней без платежей по плану (их считаем отдельно). */
export function usualPerDay(now = new Date()): number {
  const ids = personalCenterIds();
  const scope = ids.length ? ` AND (cost_center_id IS NULL OR cost_center_id IN (${ids.join(",")}))` : "";
  const r = getDb()
    .prepare(`SELECT COALESCE(SUM(-amount), 0) AS s FROM transactions WHERE kind = 'expense' AND plan_id IS NULL AND transit_id IS NULL AND occurred_at >= ? AND occurred_at < ?${scope}`)
    .get(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60).toISOString(), new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()) as { s: number };
  return Math.round(Number(r.s) / 60);
}

export function forecast30(now = new Date(), start = forecastStart()): Forecast {
  const perDay = usualPerDay(now);
  const today = ymd(now);
  const horizon = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
  const events: ForecastEvent[] = [];
  const add = (p: { title: string; due_date: string | null; total: number; paid: number; repeat: string }, sign: 1 | -1) => {
    if (!p.due_date) return;
    let d = p.due_date < today ? today : p.due_date; // просроченное — считаем, что заплатим сегодня
    let amt = p.total - p.paid;
    while (d <= horizon) {
      events.push({ date: d, title: p.title, amount: sign * amt });
      if (p.repeat !== "month") break;
      d = nextMonth(d);
      amt = p.total;
    }
  };
  for (const p of listPlans("open", 500, "in")) add(p, 1);
  const ids = new Set(personalCenterIds());
  for (const p of listPlans("open", 500, "out")) if (p.cost_center_id === null || ids.has(p.cost_center_id)) add(p, -1);
  const days: ForecastDay[] = [];
  let bal = start.amount;
  for (let i = 0; i <= 30; i++) {
    const date = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));
    const ev = events.filter((e) => e.date === date);
    bal += ev.reduce((a, e) => a + e.amount, 0) - (i === 0 ? 0 : perDay);
    days.push({ date, balance: bal, events: ev });
  }
  const min = days.reduce((m, d) => (d.balance < m.balance ? d : m), days[0]);
  return { start: start.amount, startKnown: start.known, perDay, days, end: days[days.length - 1].balance, min, shortDay: days.find((d) => d.balance < 0) ?? null };
}
