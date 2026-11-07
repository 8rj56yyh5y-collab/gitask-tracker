import { formatMoney } from "@/lib/money.ts";
import { LEVEL_LABEL, limitState } from "@/lib/limits.ts";

export function LimitBar({ used, limit }: { used: number; limit: number }) {
  if (limit <= 0) return <div className="muted small">Лимит не задан · списано {formatMoney(used)}</div>;
  const s = limitState(used, limit);
  const pct = Math.min(100, Math.round(s.ratio * 100));
  return (
    <div className={`limit limit-${s.level}`}>
      <div className="limit-track">
        <div className="limit-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="limit-text">
        <span>
          {formatMoney(used)} из {formatMoney(limit)}
        </span>
        <strong>{s.left >= 0 ? `осталось ${formatMoney(s.left)}` : `перелимит ${formatMoney(-s.left)}`}</strong>
      </div>
      <div className="limit-label">{LEVEL_LABEL[s.level]} · {Math.round(s.ratio * 100)}%</div>
    </div>
  );
}
