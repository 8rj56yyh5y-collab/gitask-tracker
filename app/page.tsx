import Link from "next/link";
import { redirect } from "next/navigation";
import { getSetting } from "@/lib/settings.ts";
import { getDb } from "@/lib/db.ts";
import { formatMoney } from "@/lib/money.ts";
import { budgetAlerts, centerTree, getTx, listRecent, listUnassigned } from "@/lib/repo.ts";
import { listPlans, ymd } from "@/lib/plans.ts";
import { readyToAccept } from "@/lib/suggest.ts";
import { detectSubscriptions, safeToSpend, unusualSpending } from "@/lib/insights.ts";
import { listGoals } from "@/lib/goals.ts";
import { acceptAllAction, undoAcceptAction } from "./actions.ts";
import { SetupCard } from "./components/SetupCard.tsx";
import { TxRow } from "./components/TxRow.tsx";
import { UnassignedItem } from "./components/UnassignedItem.tsx";

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10,
    m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

/** «Сегодня»: сколько можно тратить, что разобрать, что заметил D&N и что скоро оплатить. */
export default async function Today({ searchParams }: { searchParams: Promise<{ saved?: string; done?: string; all?: string }> }) {
  const { saved, done, all } = await searchParams;
  // Новый человек без единой операции — сначала короткое знакомство.
  if (!getSetting("welcome_seen") && !getDb().prepare("SELECT 1 FROM transactions LIMIT 1").get()) redirect("/welcome");

  const now = new Date();
  const month = now.toLocaleDateString("ru-RU", { month: "long" });
  const safe = safeToSpend(now);
  const queue = listUnassigned();
  const ready = queue.filter((t) => readyToAccept(t)).length;
  const centers = new Map(centerTree().map((c) => [c.id, c]));
  const doneTx = done ? getTx(Number(done)) : null;
  const today = ymd(now);
  const week = ymd(new Date(now.getTime() + 7 * 864e5));
  const soon = listPlans("open", 200, "out").filter((p) => p.due_date && p.due_date <= week);
  const recent = listRecent(6);

  // «D&N заметил»: необычные траты, перелимиты, найденные подписки, копилки.
  const notes: { href: string; icon: string; title: string; text: string; tone: "warn" | "info" | "good" }[] = [];
  for (const u of unusualSpending(now))
    notes.push({ href: "/analytics", icon: u.emoji || "📈", title: `${u.name}: +${u.pct}%`, text: `${formatMoney(u.now)} с начала месяца — обычно к этому дню ${formatMoney(u.usual)}`, tone: "warn" });
  for (const a of budgetAlerts(now).slice(0, 2))
    notes.push({
      href: `/centers/${a.id}`,
      icon: "⚠️",
      title: a.status === "over" ? `${a.name}: перелимит` : `${a.name}: идёт к перелимиту`,
      text: a.status === "over" ? `на ${formatMoney(a.spent - a.budget)} больше лимита` : `при таком темпе ≈ ${formatMoney(a.forecast)} при лимите ${formatMoney(a.budget)}`,
      tone: "warn",
    });
  const subs = detectSubscriptions(now);
  if (subs.length)
    notes.push({
      href: "/plans",
      icon: "🔁",
      title: `${subs.length} ${plural(subs.length, "подписка", "подписки", "подписок")} · ${formatMoney(subs.reduce((a, s) => a + s.amount, 0))}/мес`,
      text: `${subs.slice(0, 3).map((s) => s.counterparty).join(", ")} — добавьте в платежи, и D&N напомнит заранее`,
      tone: "info",
    });
  for (const g of listGoals().filter((g) => !g.done).slice(0, 2))
    notes.push({ href: `/goals?open=${g.id}#g${g.id}`, icon: g.emoji, title: `${g.name}: ${g.pct}%`, text: g.perMonth ? `откладывайте ≈ ${formatMoney(g.perMonth)} в месяц` : `осталось ${formatMoney(g.left)}`, tone: "good" });

  return (
    <div className="today">
      {saved && <div className="toast-row">✓ Расход записан</div>}
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

      {/* Главное: сколько можно тратить */}
      <Link href="/income" className="hero safe-hero">
        {safe.known ? (
          <>
            <div className="hero-top">
              <span>Можно потратить до конца месяца</span>
              <span className="hero-chip">{safe.daysLeft} {plural(safe.daysLeft, "день", "дня", "дней")}</span>
            </div>
            <div className="hero-value">{safe.left >= 0 ? formatMoney(safe.left) : `−${formatMoney(-safe.left)}`}</div>
            <div className="hero-note">
              {safe.left > 0 ? `≈ ${formatMoney(safe.perDay)} в день` : "Потрачено больше, чем есть на месяц"}
            </div>
            <div className="safe-meter" aria-hidden>
              <i style={{ width: `${safe.pct}%` }} />
            </div>
            <div className="safe-row">
              <span>
                Доходы <b>+{formatMoney(safe.income + safe.expected)}</b>
              </span>
              <span>
                Потрачено <b>−{formatMoney(safe.spent)}</b>
              </span>
              {safe.toPay > 0 && (
                <span>
                  Платежи <b>−{formatMoney(safe.toPay)}</b>
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="hero-top">
              <span>Мои траты · {month}</span>
            </div>
            <div className="hero-value">{formatMoney(safe.spent)}</div>
            <div className="hero-note">Добавьте ставку или доход — D&amp;N посчитает, сколько можно тратить в день ›</div>
          </>
        )}
      </Link>

      <SetupCard />

      {/* Разбор */}
      {queue.length > 0 ? (
        <section className="today-sec">
          <div className="today-head">
            <h2>
              Разобрать <span className="count-pill">{queue.length}</span>
            </h2>
            {ready > 1 ? (
              <form action={acceptAllAction}>
                <input type="hidden" name="next" value="/" />
                <button className="btn btn-sm btn-soft">✓ Все подсказки ({ready})</button>
              </form>
            ) : (
              queue.length > 1 && (
                <Link href="/inbox" className="link small">
                  Все ›
                </Link>
              )
            )}
          </div>
          <div className="review-stack">
            <UnassignedItem tx={queue[0]} centers={centers} next="/" />
            {queue.length > 1 && (
              <Link href="/inbox" className="stack-more">
                ещё {queue.length - 1} {plural(queue.length - 1, "операция", "операции", "операций")} на {formatMoney(queue.slice(1).reduce((a, t) => a + Math.abs(t.amount), 0))} ›
              </Link>
            )}
          </div>
        </section>
      ) : (
        recent.length > 0 && <div className="all-clear">✓ Всё разобрано. Новые траты появятся здесь сами.</div>
      )}

      {/* D&N заметил */}
      {notes.length > 0 && (
        <section className="today-sec">
          <div className="today-head">
            <h2>D&amp;N заметил</h2>
          </div>
          <div className="notes-strip">
            {notes.map((n, i) => (
              <Link key={i} href={n.href} className={`note-card tone-${n.tone}`}>
                <span className="note-icon" aria-hidden>
                  {n.icon}
                </span>
                <strong>{n.title}</strong>
                <span className="muted small">{n.text}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Скоро оплатить */}
      {soon.length > 0 && (
        <section className="today-sec">
          <div className="today-head">
            <h2>Скоро оплатить</h2>
            <Link href="/plans" className="link small">
              Все ›
            </Link>
          </div>
          <div className="card list-card">
            {soon.slice(0, 4).map((p) => {
              const over = p.due_date! < today;
              const isToday = p.due_date === today;
              const d = new Date(`${p.due_date}T12:00:00`);
              return (
                <Link key={p.id} href={`/plans/${p.id}`} className="wallet-row">
                  <span className={`date-chip ${over ? "is-over" : isToday ? "is-today" : ""}`}>
                    <b>{d.getDate()}</b>
                    <span>{d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}</span>
                  </span>
                  <span className="wallet-main">
                    <strong>{p.title}</strong>
                    <span className={`small ${over ? "danger" : "muted"}`}>{over ? "просрочен" : isToday ? "сегодня" : p.repeat === "month" ? "каждый месяц" : "на этой неделе"}</span>
                  </span>
                  <b className="num wallet-amt">{formatMoney(p.total - p.paid)}</b>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Последние */}
      <section className="today-sec">
        <div className="today-head">
          <h2>Последние операции</h2>
          <Link href="/history" className="link small">
            Вся история ›
          </Link>
        </div>
        {recent.length === 0 ? (
          <Link href="/new" className="card empty-row">
            ＋ <span>Пока пусто. Нажмите «+» внизу и запишите первую трату — это займёт три касания</span>
          </Link>
        ) : (
          <div className="card list-card">
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
