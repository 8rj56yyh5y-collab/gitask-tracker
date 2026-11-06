import Link from "next/link";
import { formatMoney } from "@/lib/money.ts";
import type { CenterStat } from "@/lib/repo.ts";

const STATUS_COLOR = { ok: "var(--green)", pace: "var(--orange)", over: "var(--red)" } as const;

/** Строка категории: расход, полоска, прогноз до конца месяца и сигнал по лимиту. */
export function BudgetLine({ s, total, href }: { s: CenterStat; total: number; href?: string }) {
  const hasBudget = s.budget > 0;
  // С лимитом — полоска показывает долю лимита и красится по статусу; без лимита — долю от всех расходов.
  const pct = hasBudget ? Math.min(100, (s.spent / s.budget) * 100) : total ? (s.spent / total) * 100 : 0;
  const fill = hasBudget && s.status !== "none" ? STATUS_COLOR[s.status] : s.color;
  const head = (
    <div className="bar-head">
      <span>
        <i className="dot" style={{ background: s.color }} />
        {s.name}
        {href && <span className="muted"> ›</span>}
      </span>
      <strong>
        {formatMoney(s.spent)}
        {hasBudget && <span className="muted small"> / {formatMoney(s.budget)}</span>}
      </strong>
    </div>
  );
  return (
    <div className={`budget budget-${s.status}`}>
      {href ? <Link href={href} className="plain">{head}</Link> : head}
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: fill }} />
        {hasBudget && s.forecast > s.spent && (
          <div
            className="bar-forecast"
            style={{ width: `${Math.min(100, (s.forecast / s.budget) * 100)}%`, borderColor: fill }}
            title="Прогноз до конца месяца"
          />
        )}
      </div>
      {s.spent > 0 && (
        <div className="small budget-note">
          {s.status === "over" ? (
            <strong className="danger">Перелимит на {formatMoney(s.spent - s.budget)}</strong>
          ) : s.status === "pace" ? (
            <strong className="warn-text">
              При таком темпе ≈ {formatMoney(s.forecast)} — выше лимита на {formatMoney(s.forecast - s.budget)}
            </strong>
          ) : (
            <span className="muted">
              прогноз на месяц ≈ {formatMoney(s.forecast)}
              {hasBudget && <> · запас {formatMoney(s.budget - s.forecast)}</>}
            </span>
          )}
          {s.early && <span className="muted"> · предварительно</span>}
        </div>
      )}
    </div>
  );
}
