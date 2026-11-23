import Link from "next/link";
import { redirect } from "next/navigation";
import { getSetting } from "@/lib/settings.ts";
import { getDb } from "@/lib/db.ts";
import { formatMoney } from "@/lib/money.ts";
import { centerTree, getTx, listMainCards, listRecent, listTxOn, listTxRange, listUnassigned } from "@/lib/repo.ts";
import { cashBalances, listCashboxes } from "@/lib/cash.ts";
import { cardBalances } from "@/lib/balance.ts";
import { listPlans, ymd } from "@/lib/plans.ts";
import { readyToAccept } from "@/lib/suggest.ts";
import { greeting } from "@/lib/insights.ts";
import { currentAccountName } from "@/lib/accounts.ts";
import { AddedToast } from "./components/AddedToast.tsx";
import { Swipe } from "./components/Motion.tsx";
import { Icon } from "./components/Icon.tsx";
import { acceptAllAction, undoAcceptAction } from "./actions.ts";
import { SetupCard } from "./components/SetupCard.tsx";
import { TxRow } from "./components/TxRow.tsx";
import { UnassignedItem } from "./components/UnassignedItem.tsx";

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10,
    m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
const signed = (k: number) => `${k < 0 ? "−" : ""}${formatMoney(Math.abs(k))}`;

/**
 * Главная (8.0): одна главная цифра — сколько всего денег, три действия, что разобрать, что скоро оплатить, последние операции.
 * Расходы «сегодня» и «за месяц» — все траты (без переводов и чужих денег), как в разделе «Операции».
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ saved?: string; done?: string; all?: string; added?: string }> }) {
  const { saved, done, all, added } = await searchParams;
  if (!getSetting("welcome_seen") && !getDb().prepare("SELECT 1 FROM transactions LIMIT 1").get()) redirect("/welcome");

  const now = new Date();
  const today = ymd(now);
  const name = currentAccountName();
  const monthName = now.toLocaleDateString("ru-RU", { month: "long" });

  // Деньги: наличные во всех кассах + баланс основных карт (у кого он указан).
  const boxes = listCashboxes();
  const cb = cashBalances();
  const cashTotal = boxes.reduce((a, b) => a + (cb.get(b.id) ?? 0), 0);
  const cards = listMainCards();
  const kb = cardBalances();
  const withBal = cards.filter((c) => kb.has(c.id));
  const cardTotal = withBal.reduce((a, c) => a + (kb.get(c.id) ?? 0), 0);
  const known = boxes.length > 0 || withBal.length > 0;

  const isSpend = (t: { kind: string; transit_id?: number | null }) => t.kind === "expense" && !t.transit_id;
  const todaySpent = listTxOn(today).filter(isSpend).reduce((a, t) => a - t.amount, 0);
  const monthSpent = listTxRange(new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString())
    .filter(isSpend)
    .reduce((a, t) => a - t.amount, 0);

  const queue = listUnassigned();
  const ready = queue.filter((t) => readyToAccept(t)).length;
  const centers = new Map(centerTree().map((c) => [c.id, c]));
  const doneTx = done ? getTx(Number(done)) : null;
  const week = ymd(new Date(now.getTime() + 7 * 864e5));
  const soon = listPlans("open", 200, "out").filter((p) => p.due_date && p.due_date <= week);
  const recent = listRecent(5);

  return (
    <div className="home8">
      <div>
        <p className="home8-date">{now.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="home8-hi">
          {greeting(now)}
          {name ? `, ${name}` : ""}
        </h1>
      </div>

      <AddedToast id={added} next="/" />
      {saved && <div className="toast-row toast-pop">✓ Записано</div>}
      {doneTx && (
        <form action={undoAcceptAction} className="toast-row">
          <input type="hidden" name="id" value={doneTx.id} />
          <input type="hidden" name="next" value="/" />
          <span>
            ✓ Записано: <b>{doneTx.counterparty || "операция"}</b> · {formatMoney(Math.abs(doneTx.amount))}
          </span>
          <button className="toast-undo">Отменить</button>
        </form>
      )}
      {all && <div className="toast-row">✓ Записано сразу: {all}</div>}

      <Link href="/wallets" className="money8">
        <div className="money8-label">Все деньги</div>
        <div className="money8-sum">{known ? signed(cashTotal + cardTotal) : "—"}</div>
        <div className="money8-parts">
          <span>
            <small>Наличные{boxes.length > 1 ? ` · ${boxes.length} кассы` : ""}</small>
            <b>{boxes.length ? signed(cashTotal) : "—"}</b>
          </span>
          <span>
            <small>Карты{withBal.length ? ` · ${withBal.length}` : ""}</small>
            <b>{withBal.length ? signed(cardTotal) : "—"}</b>
          </span>
        </div>
        {withBal.length < cards.length && (
          <p className="money8-hint">
            Баланс указан у {withBal.length} из {cards.length} карт — в «Деньгах» можно вписать остальные, чтобы сумма была полной.
          </p>
        )}
      </Link>

      <div className="today8">
        <span>
          <small>Потрачено сегодня</small>
          <b>{formatMoney(todaySpent)}</b>
        </span>
        <span>
          <small>За {monthName}</small>
          <b>{formatMoney(monthSpent)}</b>
        </span>
      </div>

      <nav className="acts8" aria-label="Записать">
        <Link href="/new">
          <Icon name="minus" size={18} />
          Расход
        </Link>
        <Link href="/new?type=in">
          <Icon name="plus" size={18} />
          Приход
        </Link>
        <Link href="/new?type=move">
          <Icon name="swap" size={18} />
          Перевод
        </Link>
      </nav>

      <SetupCard />

      {queue.length > 0 && (
        <section className="sec8">
          <div className="sec8-head">
            <h2>
              Разобрать · {queue.length}
            </h2>
            {ready > 1 ? (
              <form action={acceptAllAction}>
                <input type="hidden" name="next" value="/" />
                <button>Принять подсказки ({ready})</button>
              </form>
            ) : (
              queue.length > 1 && <Link href="/inbox">Все</Link>
            )}
          </div>
          <div className="review-stack">
            <Swipe editHref={`/inbox/${queue[0].id}`}>
              <UnassignedItem tx={queue[0]} centers={centers} next="/" />
            </Swipe>
            {queue.length > 1 && (
              <Link href="/inbox" className="stack-more">
                ещё {queue.length - 1} {plural(queue.length - 1, "операция", "операции", "операций")} ›
              </Link>
            )}
          </div>
        </section>
      )}

      {soon.length > 0 && (
        <section className="sec8">
          <div className="sec8-head">
            <h2>Скоро оплатить</h2>
            <Link href="/plans">Все</Link>
          </div>
          {soon.slice(0, 3).map((p) => {
            const over = p.due_date! < today;
            const d = new Date(`${p.due_date}T12:00:00`);
            return (
              <Link key={p.id} href={`/plans/${p.id}`} className="pay8">
                <span className={`pay8-date ${over ? "is-over" : ""}`}>
                  <b>{d.getDate()}</b>
                  {d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}
                </span>
                <span>
                  <strong>{p.title}</strong>
                  <small className={over ? "danger" : undefined}>{over ? "просрочен" : p.due_date === today ? "сегодня" : "на этой неделе"}</small>
                </span>
                <b className="num">{formatMoney(p.total - p.paid)}</b>
              </Link>
            );
          })}
        </section>
      )}

      <section className="sec8">
        <div className="sec8-head">
          <h2>Последние операции</h2>
          <Link href="/history">Все</Link>
        </div>
        {recent.length === 0 ? (
          <p className="clear8">Пока пусто. Нажмите «Расход» выше — это займёт три касания.</p>
        ) : (
          <div className="list-card">
            {recent.map((t) => (
              <Link key={t.id} href={`/inbox/${t.id}`} className="plain">
                <TxRow tx={t} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
