// Прогноз расходов категории до конца месяца и сигнал по лимиту (бюджету).

export type BudgetStatus = "none" | "ok" | "pace" | "over";

/** До этого числа месяца прогноз считается предварительным (мало данных). */
export const EARLY_UNTIL_DAY = 5;

export interface Forecast {
  /** Прогноз на весь месяц, копейки (округлён до гривен). */
  forecast: number;
  /** Мало данных — прогноз предварительный. */
  early: boolean;
}

/** Линейный прогноз: потрачено / прошло дней × дней в месяце. */
export function forecastMonth(spent: number, today: Date): Forecast {
  const day = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const raw = spent <= 0 ? 0 : (spent / day) * daysInMonth;
  return { forecast: Math.round(raw / 100) * 100, early: day < EARLY_UNTIL_DAY };
}

/**
 * none — лимит не задан; ok — укладываемся; pace — при таком темпе лимит будет превышен;
 * over — лимит уже превышен.
 */
export function budgetStatus(spent: number, budget: number, forecast: number): BudgetStatus {
  if (budget <= 0) return "none";
  if (spent > budget) return "over";
  if (forecast > budget) return "pace";
  return "ok";
}

/** Сколько можно тратить в день до конца месяца, чтобы уложиться в лимит (копейки). */
export function dailyAllowance(spent: number, budget: number, today: Date): number {
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - today.getDate() + 1;
  return Math.max(0, Math.floor((budget - spent) / daysLeft / 100) * 100);
}
