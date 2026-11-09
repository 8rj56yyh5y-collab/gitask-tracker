import Link from "next/link";
import { formatMoney } from "@/lib/money.ts";
import { itemStats } from "@/lib/shopping.ts";

export default async function Prices({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const period = p === "90" ? 90 : p === "365" ? 365 : 30;
  const stats = itemStats(new Date(Date.now() - period * 864e5).toISOString());
  const total = stats.reduce((a, s) => a + s.spent, 0);
  const max = Math.max(1, ...stats.map((s) => s.spent));
  return (
    <div className="narrow-wide">
      <div className="crumbs">
        <Link href="/shopping">Списки покупок</Link>
      </div>
      <h1>Цены товаров</h1>
      <p className="page-hint">Сколько ушло на каждый товар и сколько он стоит в среднем. Считается по закрытым чекам, где вписаны цены.</p>
      <nav className="segtabs" aria-label="Период">
        {[
          ["30", "30 дней"],
          ["90", "3 месяца"],
          ["365", "Год"],
        ].map(([k, t]) => (
          <Link key={k} href={`/shopping/prices?p=${k}`} className={`segtab ${String(period) === k ? "is-on" : ""}`}>
            {t}
          </Link>
        ))}
      </nav>
      {stats.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🧾</div>
          <strong>Пока нет цен</strong>
          <p>Вписывайте цены в списке покупок и закрывайте чек — здесь появится, сколько стоят ваши товары.</p>
        </div>
      ) : (
        <section className="card">
          <div className="row-between" style={{ marginBottom: 10 }}>
            <span className="muted small">Всего по товарам</span>
            <strong>{formatMoney(total)}</strong>
          </div>
          <ul className="cat-bars">
            {stats.map((s) => (
              <li key={s.name}>
                <div className="row-between">
                  <span>
                    {s.name} <span className="muted small">· {s.times} раз{s.qty ? ` · ${s.qty.toLocaleString("ru-RU")} ${s.unit}` : ""}</span>
                  </span>
                  <strong>{formatMoney(s.spent)}</strong>
                </div>
                <span className="cat-bar">
                  <i style={{ width: `${(s.spent / max) * 100}%` }} />
                </span>
                {s.perUnit !== null && (
                  <span className="muted small">
                    в среднем {formatMoney(s.unit === "г" || s.unit === "мл" ? s.perUnit * 100 : s.perUnit)} за {s.unit === "г" ? "100 г" : s.unit === "мл" ? "100 мл" : `1 ${s.unit}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
