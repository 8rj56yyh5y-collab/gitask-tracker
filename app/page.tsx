import Link from "next/link";
import { redirect } from "next/navigation";
import { getSetting } from "@/lib/settings.ts";
import { getDb } from "@/lib/db.ts";
import { formatMoney } from "@/lib/money.ts";
import { budgetAlerts, centerTree, getTx, groupUsage, listMainCards, listRecent, listTxOn, listTxRange, listUnassigned, personalCenterIds } from "@/lib/repo.ts";
import { catColor, shortName } from "@/lib/categories.ts";
import { cardStyle } from "@/lib/banks.ts";
import { cashBalances, listCashboxes } from "@/lib/cash.ts";
import { isSimple } from "@/lib/mode.ts";
import { categoryBudgets } from "@/lib/catbudget.ts";
import { InstallHint } from "./components/InstallHint.tsx";
import { DayRing } from "./components/DayRing.tsx";
import { listPlans, ymd } from "@/lib/plans.ts";
import { readyToAccept } from "@/lib/suggest.ts";
import { detectSubscriptions, greeting, safeToSpend, streakDays, unusualSpending } from "@/lib/insights.ts";
import { currentAccountName } from "@/lib/accounts.ts";
import { QuickLine } from "./components/QuickLine.tsx";
import { QuickTemplates } from "./components/QuickTemplates.tsx";
import { AddedToast } from "./components/AddedToast.tsx";
import { Confetti, CountUp, Swipe } from "./components/Motion.tsx";
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
export default async function Today({ searchParams }: { searchParams: Promise<{ saved?: string; done?: string; all?: string; added?: string }> }) {
  const { saved, done, all, added } = await searchParams;
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
  const recent = listRecent(5);
  const streak = streakDays(now);
  const name = currentAccountName();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // Сегодняшние траты: в простом режиме — все, в расширенном — только мои (как в «Можно потратить»).
  const mine = new Set(personalCenterIds());
  const simple = isSimple();
  const counts = (t: { kind: string; transit_id?: number | null; cost_center_id: number | null }) =>
    t.kind === "expense" && !t.transit_id && (simple || t.cost_center_id === null || mine.has(t.cost_center_id));
  const todaySpent = listTxOn(today).filter(counts).reduce((a, t) => a - (t as { amount: number }).amount, 0);
  // Неделя: столбики за 7 дней (сегодня — последний).
  const week7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i);
    const key = ymd(d);
    return { key, wd: d.toLocaleDateString("ru-RU", { weekday: "short" }), s: key === today ? todaySpent : listTxOn(key).filter(counts).reduce((a, t) => a - t.amount, 0) };
  });
  const weekMax = Math.max(1, ...week7.map((d) => d.s));
  // Кружки категорий: на что ушли мои деньги в этом месяце.
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const byCat = new Map<number, { id: number; name: string; emoji: string; s: number }>();
  for (const t of listTxRange(monthStart, new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()).filter(counts)) {
    if (!t.category_id) continue;
    const c = byCat.get(t.category_id) ?? { id: t.category_id, name: t.category_name ?? "", emoji: t.category_emoji ?? "•", s: 0 };
    c.s -= t.amount;
    byCat.set(t.category_id, c);
  }
  const topCats = [...byCat.values()].sort((a, b) => b.s - a.s).slice(0, 8);
  // Карты-градиенты: сколько списано и сколько осталось лимита.
  const cards = listMainCards();
  const usage = groupUsage();
  const boxes = simple ? [] : listCashboxes();
  const boxBal = cashBalances();
  // Норма на день: что осталось на месяц (вместе с сегодняшними тратами), поровну на оставшиеся дни.
  const dayLimit = safe.known ? Math.max(0, Math.floor((safe.left + todaySpent) / safe.daysLeft / 100) * 100) : 0;

  // «D&N заметил»: необычные траты, перелимиты, найденные подписки, копилки.
  const notes: { href: string; icon: string; title: string; text: string; tone: "warn" | "info" | "good" }[] = [];
  for (const b of categoryBudgets(now, simple).filter((b) => b.level !== "ok"))
    notes.push({
      href: `/spend?cat=${b.categoryId}`,
      icon: b.emoji || "🎯",
      title: b.level === "over" ? `${b.name}: перелимит` : `${b.name}: ${b.pct}% лимита`,
      text: b.level === "over" ? `на ${formatMoney(-b.left)} больше, чем вы себе разрешили` : `осталось ${formatMoney(b.left)} до конца месяца`,
      tone: "warn",
    });
  for (const u of unusualSpending(now))
    notes.push({ href: "/analytics", icon: u.emoji || "📈", title: `${u.name}: +${u.pct}%`, text: `${formatMoney(u.now)} с начала месяца — обычно к этому дню ${formatMoney(u.usual)}`, tone: "warn" });
  for (const a of budgetAlerts(now).slice(0, 2))
    notes.push({
      href: simple ? "/spend" : `/centers/${a.id}`,
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
      <div className="greet">
        <div>
          <strong className="greet-hi">
            {greeting(now)}
            {name ? `, ${name}` : ""}
          </strong>
          <span className="muted small">{now.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
        {streak >= 2 && (
          <span className="streak" title="Столько дней подряд все траты записаны">
            🔥 {streak} {plural(streak, "день", "дня", "дней")}
          </span>
        )}
      </div>
      <AddedToast id={added} next="/" />
      {saved && <div className="toast-row toast-pop">✓ Расход записан</div>}
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

      {/* Главное: сколько потрачено сегодня и сколько можно — одним взглядом */}
      <Link href="/spend" className="hero day-hero">
        <DayRing spent={todaySpent} limit={safe.known ? dayLimit : 0} />
        <div className="day-main">
          <span className="day-label">Сегодня потрачено</span>
          <b className="day-sum">
            <CountUp value={todaySpent} format="money" />
          </b>
          <span className="day-sub">
            {safe.known
              ? dayLimit > 0
                ? todaySpent <= dayLimit
                  ? `можно ещё ${formatMoney(dayLimit - todaySpent)} сегодня`
                  : `на ${formatMoney(todaySpent - dayLimit)} больше дневной нормы`
                : "в этом месяце уже всё потрачено"
              : `за ${month} — ${formatMoney(safe.spent)}`}
          </span>
        </div>
        <div className="week-bars" aria-label="Траты за 7 дней">
          {week7.map((d) => (
            <span key={d.key} className={`wb ${d.key === today ? "is-today" : ""} ${dayLimit > 0 && d.s > dayLimit ? "is-over" : ""}`} title={`${d.wd}: ${formatMoney(d.s)}`}>
              <i style={{ height: `${Math.max(6, Math.round((d.s / weekMax) * 100))}%` }} />
              <small>{d.wd}</small>
            </span>
          ))}
        </div>
        <div className="day-foot">
          {safe.known ? (
            <>
              <span>До конца месяца можно</span>
              <b>{safe.left >= 0 ? formatMoney(safe.left) : `−${formatMoney(-safe.left)}`}</b>
              <span className="day-foot-days">
                {safe.daysLeft} {plural(safe.daysLeft, "день", "дня", "дней")}
              </span>
            </>
          ) : (
            <span>Добавьте ставку или доход в «Деньги» — D&amp;N посчитает, сколько можно тратить в день ›</span>
          )}
        </div>
      </Link>

      <nav className="act-row" aria-label="Быстрые действия">
        <Link href="/new" className="act is-main">
          <i aria-hidden>＋</i>Записать
        </Link>
        <Link href="/spend" className="act">
          <i aria-hidden>📊</i>Траты
        </Link>
        <Link href="/forecast" className="act">
          <i aria-hidden>🔮</i>Прогноз
        </Link>
        <Link href="/ask" className="act">
          <i aria-hidden>✨</i>Спросить
        </Link>
      </nav>

      <QuickLine next="/" />
      <QuickTemplates next="/" />

      {now.getDate() <= 7 && (
        <Link href="/recap" className="recap-teaser">
          <span aria-hidden>✨</span>
          <span>
            <b>Итоги {prevMonth.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }).replace(/^\d+\s/, "")} готовы</b>
            <span className="small">Сколько ушло, на что больше всего, любимое место</span>
          </span>
          <span aria-hidden>›</span>
        </Link>
      )}

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
            <Swipe editHref={`/inbox/${queue[0].id}`}>
              <UnassignedItem tx={queue[0]} centers={centers} next="/" />
            </Swipe>
            {queue.length > 1 && (
              <Link href="/inbox" className="stack-more">
                ещё {queue.length - 1} {plural(queue.length - 1, "операция", "операции", "операций")} на {formatMoney(queue.slice(1).reduce((a, t) => a + Math.abs(t.amount), 0))} ›
              </Link>
            )}
          </div>
        </section>
      ) : (
        recent.length > 0 && (
          <>
            <div className="all-clear">✓ Всё разобрано. Новые траты появятся здесь сами.</div>
            {(done || all) && <Confetti id={`clear-${today}`} />}
          </>
        )
      )}

      {/* На что ушли деньги — цветные кружки */}
      {topCats.length > 0 && (
        <section className="today-sec">
          <div className="today-head">
            <h2>На что в {month.replace(/ь$/, "е").replace(/й$/, "е").replace(/т$/, "те")}</h2>
            <Link href="/spend" className="link small">
              Все ›
            </Link>
          </div>
          <div className="bubbles">
            {topCats.map((c) => (
              <Link key={c.id} href={`/spend?cat=${c.id}`} className="bubble" style={{ "--bc": catColor(c.name) } as React.CSSProperties}>
                <i aria-hidden>{c.emoji}</i>
                <span>{shortName(c.name)}</span>
                <b>{formatMoney(c.s).replace(/,\d+/, "")}</b>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Карты и наличные */}
      {(cards.length > 0 || boxes.length > 0) && (
        <section className="today-sec">
          <div className="today-head">
            <h2>Карты{boxes.length > 0 ? " и наличные" : ""}</h2>
            <Link href="/wallets" className="link small">
              Деньги ›
            </Link>
          </div>
          <div className="gcards">
            {cards.map((c) => {
              const used = usage.get(c.id) ?? 0;
              const lim = c.monthly_limit;
              return (
                <Link key={c.id} href={`/cards/${c.id}`} className="gcard" style={{ "--gc": cardStyle(c).color } as React.CSSProperties}>
                  <span className="gcard-top">
                    {c.bank}
                    <small>•• {c.last4}</small>
                  </span>
                  <span>
                    <span className="gcard-sum">{lim > 0 ? formatMoney(Math.max(0, lim - used)) : formatMoney(used)}</span>
                    <span className="gcard-sub">{lim > 0 ? ` осталось из ${formatMoney(lim)}` : " списано в этом месяце"}</span>
                    {lim > 0 && (
                      <span className="gcard-track" style={{ display: "block" }}>
                        <i style={{ width: `${Math.min(100, (used / lim) * 100)}%` }} />
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
            {boxes.map((b) => (
              <Link key={`b${b.id}`} href={`/cash/${b.id}`} className="gcard is-cash" style={{ "--gc": b.color || "#16a34a" } as React.CSSProperties}>
                <span className="gcard-top">
                  {b.name}
                  <small>наличные</small>
                </span>
                <span className="gcard-sum">{formatMoney(boxBal.get(b.id) ?? 0)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* D&N заметил */}
      {notes.length > 0 && (
        <section className="today-sec">
          <div className="today-head">
            <h2>D&amp;N заметил</h2>
          </div>
          <div className="notes-strip">
            {notes.slice(0, 3).map((n, i) => (
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

      <InstallHint />

      {/* Последние */}
      <section className="today-sec">
        <div className="today-head">
          <h2>Последние траты</h2>
          <Link href="/spend" className="link small">
            Все траты ›
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
