import Link from "next/link";
import { formatMoney } from "@/lib/money.ts";
import type { MonthTotal } from "@/lib/repo.ts";

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/**
 * Расходы по месяцам: один ряд, выбранный месяц выделен и подписан суммой.
 * Обычные HTML-столбики (не SVG), чтобы подписи не мельчали на телефоне. Нажатие открывает месяц.
 */
export function MonthBars({ data, selected }: { data: MonthTotal[]; selected: string }) {
  const max = Math.max(1, ...data.map((d) => d.expense));
  return (
    <div className="bars-chart" role="list" aria-label="Расходы по месяцам за год">
      {data.map((d) => {
        const on = d.key === selected;
        const month = MONTHS[Number(d.key.slice(5)) - 1];
        const label = `${month} ${d.key.slice(0, 4)}: ${formatMoney(d.expense)}`;
        return (
          <Link key={d.key} href={`/analytics?m=${d.key}`} className={`bc-col ${on ? "is-on" : ""}`} title={label} aria-label={label} role="listitem">
            <span className="bc-value">{on && d.expense > 0 ? `${Math.round(d.expense / 100_000)} тыс` : ""}</span>
            <span className="bc-track">
              {d.expense > 0 && <span className="bc-bar" style={{ height: `${Math.max(3, (d.expense / max) * 100)}%` }} />}
            </span>
            <span className="bc-label">{month}</span>
          </Link>
        );
      })}
    </div>
  );
}
