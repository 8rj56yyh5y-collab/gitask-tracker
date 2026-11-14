import { getDb } from "./db.ts";
import { getSetting, setSetting } from "./settings.ts";
import { ymd } from "./plans.ts";

// Налоги ФОП: сколько и когда платить, сколько осталось до лимита дохода группы.
// Цифры (минималка, ставка, лимит) — настраиваемые: законы меняются, проверяйте у бухгалтера.

export interface FopSettings {
  group: 2 | 3 | null;
  /** Минимальная зарплата на 1 января текущего года, копейки. */
  minWage: number;
  /** Ставка единого налога для 3 группы, %. */
  rate: number;
}

/** Значения по умолчанию на 2026 год. */
export const FOP_DEFAULTS = { minWage: 8_647_00, rate: 5 };

export function fopSettings(): FopSettings {
  const g = Number(getSetting("fop_group"));
  return {
    group: g === 2 || g === 3 ? g : null,
    minWage: Number(getSetting("fop_min_wage")) || FOP_DEFAULTS.minWage,
    rate: Number(getSetting("fop_rate")) || FOP_DEFAULTS.rate,
  };
}

export function saveFopSettings(s: { group: number | null; minWage?: number | null; rate?: number | null }) {
  setSetting("fop_group", s.group === 2 || s.group === 3 ? String(s.group) : null);
  setSetting("fop_min_wage", s.minWage && s.minWage > 0 ? String(Math.round(s.minWage)) : null);
  setSetting("fop_rate", s.rate && s.rate > 0 && s.rate <= 20 ? String(s.rate) : null);
}

/** Доход ФОП за период: поступления на карты с типом «ФОП» (и их дополнительные карты). */
export function fopIncome(from: Date, to: Date): number {
  const r = getDb()
    .prepare(
      `SELECT COALESCE(SUM(t.amount), 0) AS s FROM transactions t JOIN cards c ON c.id = t.card_id
       LEFT JOIN cards p ON p.id = c.parent_id
       WHERE t.amount > 0 AND t.kind != 'internal' AND t.transit_id IS NULL
         AND (c.kind = 'fop' OR p.kind = 'fop') AND t.occurred_at >= ? AND t.occurred_at < ?`,
    )
    .get(from.toISOString(), to.toISOString()) as { s: number };
  return Number(r.s);
}

export function fopCardsCount(): number {
  return Number((getDb().prepare("SELECT COUNT(*) AS n FROM cards WHERE kind = 'fop' AND archived = 0").get() as { n: number }).n);
}

export interface Duty {
  /** Что платить. */
  title: string;
  amount: number;
  /** Крайний срок, YYYY-MM-DD. */
  due: string;
  /** За какой период. */
  period: string;
  note?: string;
}

const Q_NAMES = ["I квартал", "II квартал", "III квартал", "IV квартал"];

/**
 * Ближайшие платежи ФОП (на ~3 месяца вперёд), которые ещё не прошли.
 * 3 группа: единый налог % от дохода и военный сбор 1% — за квартал, до 50-го дня после него (декларация — до 40-го);
 *           ЕСВ 22% минималки в месяц — за квартал, до 20 числа после квартала.
 * 2 группа: единый налог 20% минималки и военный сбор 10% минималки — каждый месяц до 20 числа этого месяца;
 *           ЕСВ — как у 3 группы.
 */
export function fopDuties(now = new Date(), s = fopSettings()): Duty[] {
  if (!s.group) return [];
  const today = ymd(now);
  const out: Duty[] = [];
  const esv = Math.round(s.minWage * 0.22);
  // Кварталы: текущий и предыдущий (если срок по нему ещё не прошёл).
  const qNow = Math.floor(now.getMonth() / 3);
  for (const back of [1, 0]) {
    const qi = qNow - back;
    const y = now.getFullYear() + Math.floor(qi / 4);
    const q = ((qi % 4) + 4) % 4;
    const from = new Date(y, q * 3, 1);
    const to = new Date(y, q * 3 + 3, 1);
    const period = `${Q_NAMES[q]} ${y}`;
    out.push({ title: "ЕСВ (за себя)", amount: esv * 3, due: ymd(new Date(y, q * 3 + 3, 20)), period, note: "22% минималки × 3 месяца" });
    if (s.group === 3) {
      const income = fopIncome(from, to);
      const end = new Date(y, q * 3 + 3, 0);
      const dueTax = ymd(new Date(end.getFullYear(), end.getMonth(), end.getDate() + 50));
      const dueDecl = ymd(new Date(end.getFullYear(), end.getMonth(), end.getDate() + 40));
      out.push({ title: "Единый налог", amount: Math.round((income * s.rate) / 100), due: dueTax, period, note: `${s.rate}% от дохода ${Math.round(income / 100).toLocaleString("ru-RU")} ₴${back === 0 ? " (квартал ещё идёт — сумма растёт)" : ""}` });
      out.push({ title: "Военный сбор", amount: Math.round(income / 100), due: dueTax, period, note: "1% от дохода" });
      out.push({ title: "Декларация", amount: 0, due: dueDecl, period, note: "подать в Электронном кабинете" });
    }
  }
  if (s.group === 2) {
    for (let k = 0; k < 3; k++) {
      const m = new Date(now.getFullYear(), now.getMonth() + k, 1);
      const period = m.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(" г.", "");
      out.push({ title: "Единый налог", amount: Math.round(s.minWage * 0.2), due: ymd(new Date(m.getFullYear(), m.getMonth(), 20)), period, note: "20% минималки" });
      out.push({ title: "Военный сбор", amount: Math.round(s.minWage * 0.1), due: ymd(new Date(m.getFullYear(), m.getMonth(), 20)), period, note: "10% минималки" });
    }
  }
  return out.filter((d) => d.due >= today).sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));
}

/** Лимит дохода за год: 2 группа — 834 минималки, 3 группа — 1167 минималок. */
export function fopLimit(s = fopSettings()): number {
  return s.group === 2 ? s.minWage * 834 : s.group === 3 ? s.minWage * 1167 : 0;
}

export function fopYear(now = new Date(), s = fopSettings()) {
  const income = fopIncome(new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1));
  const limit = fopLimit(s);
  return { income, limit, left: limit - income, pct: limit ? Math.min(100, Math.round((income / limit) * 100)) : 0 };
}
