import Link from "next/link";
import { groupUsage, listMainCards } from "@/lib/repo.ts";
import { cashBalances, cashStats, listCashboxes } from "@/lib/cash.ts";
import { listGoals } from "@/lib/goals.ts";
import { transitOpenSum } from "@/lib/transit.ts";
import { limitState } from "@/lib/limits.ts";
import { cardStyle } from "@/lib/banks.ts";
import { formatMoney } from "@/lib/money.ts";

/** Кошельки: всё, где лежат деньги, на одном экране — карты, кассы, копилки и чужие деньги. */
export default function Wallets() {
  const cards = listMainCards();
  const usage = groupUsage();
  const boxes = listCashboxes();
  const bal = cashBalances();
  const goals = listGoals();
  const transit = transitOpenSum();
  const cash = boxes.reduce((a, b) => a + (bal.get(b.id) ?? 0), 0);
  const saved = goals.reduce((a, g) => a + g.saved, 0);
  const spentCards = cards.reduce((a, c) => a + (usage.get(c.id) ?? 0), 0);
  const month = new Date().toLocaleDateString("ru-RU", { month: "long" });

  return (
    <div className="narrow-wide">
      <h1>Кошельки</h1>

      <section className="wallet-sum">
        <div>
          <span>Наличные</span>
          <b className="num">{formatMoney(cash)}</b>
        </div>
        <div>
          <span>В копилках</span>
          <b className="num">{formatMoney(saved)}</b>
        </div>
        <div>
          <span>С карт за {month}</span>
          <b className="num">{formatMoney(spentCards)}</b>
        </div>
      </section>

      <div className="row-between section-row">
        <h2>Карты</h2>
        <Link href="/cards" className="link small">
          Все карты и лимиты ›
        </Link>
      </div>
      {cards.length === 0 ? (
        <Link href="/cards" className="card empty-row">
          💳 <span>Добавьте карту — траты по ней будут попадать в лимит и в разбор</span>
        </Link>
      ) : (
        <div className="wallet-cards">
          {cards.map((c) => {
            const used = usage.get(c.id) ?? 0;
            const st = c.monthly_limit > 0 ? limitState(used, c.monthly_limit) : null;
            const cs = cardStyle(c);
            return (
              <Link key={c.id} href={`/cards/${c.id}`} className="mini-card" style={{ "--c": cs.color, "--ink": cs.ink } as React.CSSProperties}>
                <span className="mini-card-bank">{c.bank}</span>
                <span className="mini-card-num">•• {c.last4}</span>
                <span className="mini-card-sum">
                  {st ? (st.left >= 0 ? `осталось ${formatMoney(st.left)}` : `перелимит ${formatMoney(-st.left)}`) : `списано ${formatMoney(used)}`}
                </span>
                {st && (
                  <span className="mini-card-track">
                    <i style={{ width: `${Math.min(100, (used / c.monthly_limit) * 100)}%` }} className={`lvl-${st.level}`} />
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <div className="row-between section-row">
        <h2>Наличные</h2>
        <Link href="/cash?new=1#new" className="link small">
          + Касса
        </Link>
      </div>
      {boxes.length === 0 ? (
        <Link href="/cash?new=1#new" className="card empty-row">
          💵 <span>Заведите кассу — например, «Дома». Остаток наличных всегда будет точным</span>
        </Link>
      ) : (
        <div className="card list-card">
          {boxes.map((b) => {
            const s = cashStats(b.id);
            return (
              <Link key={b.id} href={`/cash/${b.id}`} className="wallet-row">
                <span className="wallet-dot" style={{ background: b.color || "var(--accent)" }} aria-hidden />
                <span className="wallet-main">
                  <strong>{b.name}</strong>
                  <span className="muted small">
                    {s.forecastEnd !== null ? `к концу месяца ≈ ${formatMoney(s.forecastEnd)}` : s.monthOut ? `за месяц потрачено ${formatMoney(s.monthOut)}` : "без движений в этом месяце"}
                  </span>
                </span>
                <b className="num wallet-amt">{formatMoney(bal.get(b.id) ?? 0)}</b>
              </Link>
            );
          })}
        </div>
      )}

      <div className="row-between section-row">
        <h2>Копилки</h2>
        <Link href={goals.length ? "/goals" : "/goals?new=1#new"} className="link small">
          {goals.length ? "Все копилки ›" : "+ Копилка"}
        </Link>
      </div>
      {goals.length === 0 ? (
        <Link href="/goals?new=1#new" className="card empty-row">
          🎯 <span>Копите на отпуск или ремонт? Заведите копилку — D&amp;N посчитает, сколько откладывать в месяц</span>
        </Link>
      ) : (
        <div className="card list-card">
          {goals.map((g) => (
            <Link key={g.id} href={`/goals?open=${g.id}#g${g.id}`} className="wallet-row">
              <span className="wallet-emoji" aria-hidden>
                {g.emoji}
              </span>
              <span className="wallet-main">
                <strong>{g.name}</strong>
                <span className="goal-track goal-track-sm">
                  <i style={{ width: `${g.pct}%` }} />
                </span>
              </span>
              <b className="num wallet-amt">{formatMoney(g.saved)}</b>
            </Link>
          ))}
        </div>
      )}

      {transit > 0 && (
        <Link href="/transit" className="card wallet-transit">
          <span>
            <strong>Чужие деньги у вас</strong>
            <span className="muted small">Их нужно кому-то передать — они не ваши расходы и доходы</span>
          </span>
          <b className="num">{formatMoney(transit)}</b>
        </Link>
      )}
    </div>
  );
}
