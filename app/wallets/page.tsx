import Link from "next/link";
import { groupUsage, listMainCards } from "@/lib/repo.ts";
import { cashBalances, cashStats, listCashboxes } from "@/lib/cash.ts";
import { listGoals } from "@/lib/goals.ts";
import { transitOpenSum } from "@/lib/transit.ts";
import { limitState } from "@/lib/limits.ts";
import { cardStyle } from "@/lib/banks.ts";
import { formatMoney } from "@/lib/money.ts";
import { cardBalances } from "@/lib/balance.ts";
import { isSimple } from "@/lib/mode.ts";

/** «Деньги»: всё, где лежат деньги, на одном экране — карты, наличные, копилки и чужие деньги. */
export default function Wallets() {
  const simple = isSimple();
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
  const cardBal = cardBalances();
  const mainBal = cards.reduce((a, c) => a + (cardBal.get(c.id) ?? 0), 0);
  const mainWith = cards.filter((c) => cardBal.has(c.id)).length;

  return (
    <div className="narrow-wide">
      <h1>Деньги</h1>

      {mainWith > 0 && (
        <section className="wallet-total">
          <span className="muted small">Всего на картах{cash ? " и наличными" : ""}</span>
          {/* Только основные карты: у дополнительной карты нет своих денег — её траты уже в балансе основной. */}
          <b className="num">{formatMoney(mainBal + cash)}</b>
          {mainWith < cards.length && <span className="muted small">баланс указан у {mainWith} из {cards.length} карт — остальные можно добавить в карточке карты</span>}
        </section>
      )}

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
            const lim = c.monthly_limit;
            const b = cardBal.get(c.id);
            return (
              <Link key={c.id} href={`/cards/${c.id}`} className="gcard" style={{ "--gc": cardStyle(c).color } as React.CSSProperties}>
                <span className="gcard-top">
                  {c.bank}
                  <small>•• {c.last4}</small>
                </span>
                <span>
                  <span className="gcard-sum">{b !== undefined ? formatMoney(b) : lim > 0 ? formatMoney(Math.max(0, lim - used)) : formatMoney(used)}</span>
                  <span className="gcard-sub">
                    {b !== undefined ? " на карте" : lim > 0 ? ` осталось из лимита ${formatMoney(lim)}` : " списано в этом месяце"}
                  </span>
                  {lim > 0 && (
                    <span className="gcard-track" style={{ display: "block" }}>
                      <i style={{ width: `${Math.min(100, (used / lim) * 100)}%` }} />
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
          <Link href="/cards" className="gcard is-add">
            + Карта
          </Link>
        </div>
      )}

      {(!simple || boxes.length > 0) && (
        <>
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

        </>
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

      {!simple && transit > 0 && (
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
