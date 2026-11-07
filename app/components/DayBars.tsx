import { formatMoney } from "@/lib/money.ts";

/** Расходы по дням месяца: столбик на каждый день; сегодня выделен, будущие дни бледные. */
export function DayBars({ data, today }: { data: { day: number; date: string; expense: number }[]; today: string }) {
  const max = Math.max(1, ...data.map((d) => d.expense));
  return (
    <div className="day-chart" role="list" aria-label="Расходы по дням">
      {data.map((d) => {
        const future = d.date > today;
        const label = `${d.day}: ${formatMoney(d.expense)}`;
        return (
          <div key={d.date} className={`dc-col ${d.date === today ? "is-today" : ""} ${future ? "is-future" : ""}`} title={label} aria-label={label} role="listitem">
            <span className="dc-track">{d.expense > 0 && <span className="dc-bar" style={{ height: `${Math.max(4, (d.expense / max) * 100)}%` }} />}</span>
            <span className="dc-label">{d.day === 1 || d.day % 5 === 0 || d.date === today ? d.day : ""}</span>
          </div>
        );
      })}
    </div>
  );
}
