/**
 * Кольцо дня: сколько из дневной нормы уже потрачено. Без нормы — просто кольцо-значок.
 * Зелёное — в пределах нормы, оранжевое — почти всё, красное — больше нормы.
 */
export function DayRing({ spent, limit }: { spent: number; limit: number }) {
  const R = 30;
  const C = 2 * Math.PI * R;
  const k = limit > 0 ? Math.min(1, spent / limit) : spent > 0 ? 1 : 0;
  const tone = limit <= 0 ? "#ffffff" : spent > limit ? "#ff8a8a" : spent > limit * 0.8 ? "#ffd27a" : "#9ff0c0";
  const pct = limit > 0 ? Math.round((spent / limit) * 100) : null;
  return (
    <svg viewBox="0 0 80 80" className="day-ring" role="img" aria-label={pct === null ? "Сегодня" : `Потрачено ${pct}% дневной нормы`}>
      <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="9" />
      <circle
        cx="40"
        cy="40"
        r={R}
        fill="none"
        stroke={tone}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${Math.max(k * C, k > 0 ? 0.01 : 0)} ${C}`}
        transform="rotate(-90 40 40)"
        className="day-ring-arc"
      />
      <text x="40" y="45" textAnchor="middle" className="day-ring-text">
        {pct === null ? "₴" : `${Math.min(pct, 999)}%`}
      </text>
    </svg>
  );
}
