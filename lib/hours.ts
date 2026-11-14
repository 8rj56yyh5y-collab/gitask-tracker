import { getSetting, setSetting } from "./settings.ts";
import { listSalaries } from "./income.ts";

// «Сколько это в часах работы»: цена часа = месячная ставка / 168 рабочих часов, или своя.

export const WORK_HOURS_MONTH = 168;

/** Цена часа, копейки. 0 — не знаем (нет ставки и не задана вручную). */
export function hourRate(): number {
  const own = Number(getSetting("hour_rate"));
  if (own > 0) return own;
  const monthly = listSalaries().reduce((a, p) => a + p.total, 0);
  return monthly > 0 ? Math.round(monthly / WORK_HOURS_MONTH) : 0;
}

export function setHourRate(kop: number | null) {
  setSetting("hour_rate", kop && kop > 0 ? String(Math.round(kop)) : null);
}

export { inWorkTimeAt } from "./worktime.ts";
import { inWorkTimeAt } from "./worktime.ts";

/** «≈ 2,5 ч работы» по текущей цене часа. Пусто, если цена часа неизвестна. */
export function inWorkTime(amountKop: number, rate = hourRate()): string {
  return inWorkTimeAt(amountKop, rate);
}
