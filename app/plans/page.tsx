import Link from "next/link";
import { createPlanAction, payCompanyAction } from "../actions.ts";
import { AccountChips, CenterChips } from "../components/Pickers.tsx";
import { formatMoney } from "@/lib/money.ts";
import { listPlans, ymd, type Plan } from "@/lib/plans.ts";
import { companyDebt } from "@/lib/sales.ts";

const DAY = 864e5;
function dueInfo(p: Plan, today: string) {
  if (!p.due_date) return { cls: "", text: "без даты" };
  const days = Math.round((new Date(`${p.due_date}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / DAY);
  if (days < 0) return { cls: "due-over", text: `просрочено на ${-days} дн.` };
  if (days === 0) return { cls: "due-today", text: "сегодня" };
  if (days === 1) return { cls: "due-soon", text: "завтра" };
  if (days <= 7) return { cls: "due-soon", text: `через ${days} дн.` };
  return { cls: "", text: `через ${days} дн.` };
}

function DateTile({ date }: { date: string | null }) {
  if (!date) return <span className="date-tile is-empty">—</span>;
  const d = new Date(`${date}T12:00:00`);
  return (
    <span className="date-tile">
      <b>{d.getDate()}</b>
      <span>{d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}</span>
    </span>
  );
}

function PlanRow({ p, today }: { p: Plan; today: string }) {
  const d = dueInfo(p, today);
  const left = p.total - p.paid;
  const isIn = p.direction === "in";
  return (
    <Link href={`/plans/${p.id}`} className={`plan-row ${d.cls}`}>
      <DateTile date={p.due_date} />
      <span className="plan-main">
        <strong>{p.title}</strong>
        <span className={`plan-due ${d.cls}`}>
          {d.text}
          {p.repeat === "month" && " · каждый месяц"}
        </span>
        {p.paid > 0 && (
          <span className="plan-progress">
            <span className="limit-track">
              <span className="limit-fill" style={{ width: `${Math.min(100, (p.paid / p.total) * 100)}%`, background: "var(--green)", display: "block" }} />
            </span>
            <span className="muted small">
              {isIn ? "получено" : "оплачено"} {formatMoney(p.paid)} из {formatMoney(p.total)}
            </span>
          </span>
        )}
      </span>
      <strong className={`plan-amount ${isIn ? "pos-text" : ""}`}>
        {isIn ? "+" : ""}
        {formatMoney(left)}
      </strong>
    </Link>
  );
}

const TABS = [
  { id: "out", name: "Я плачу" },
  { id: "in", name: "Мне должны" },
  { id: "company", name: "Долг компании" },
] as const;

export default async function Plans({ searchParams }: { searchParams: Promise<{ tab?: string; new?: string }> }) {
  const { tab: rawTab, new: openNew } = await searchParams;
  const tab = TABS.find((t) => t.id === rawTab)?.id ?? "out";
  const today = ymd(new Date());
  const week = ymd(new Date(Date.now() + 7 * DAY));
  const outOpen = listPlans("open", 200, "out");
  const inOpen = listPlans("open", 200, "in").filter((p) => p.kind !== "salary");
  const debt = companyDebt();
  const sum = (l: Plan[]) => l.reduce((a, p) => a + p.total - p.paid, 0);
  const counts: Record<string, string> = { out: formatMoney(sum(outOpen)), in: formatMoney(sum(inOpen)), company: formatMoney(Math.max(0, debt)) };

  const open = tab === "in" ? inOpen : outOpen;
  const done = tab === "company" ? [] : listPlans("done", 15, tab).filter((p) => p.kind !== "salary");
  const groups: [string, Plan[]][] = [
    ["Просрочено", open.filter((p) => p.due_date && p.due_date < today)],
    ["Сегодня", open.filter((p) => p.due_date === today)],
    ["На этой неделе", open.filter((p) => p.due_date && p.due_date > today && p.due_date <= week)],
    ["Позже", open.filter((p) => p.due_date && p.due_date > week)],
    ["Без даты", open.filter((p) => !p.due_date)],
  ];
  const isIn = tab === "in";

  return (
    <div className="narrow-wide">
      <div className="page-head">
        <h1>Платежи</h1>
        {tab !== "company" && (
          <Link href={`/plans?tab=${tab}&new=1#new`} className="btn btn-primary btn-sm">
            + {isIn ? "Долг мне" : "Платёж"}
          </Link>
        )}
      </div>
      <nav className="ptabs" aria-label="Разделы платежей">
        {TABS.map((t) => (
          <Link key={t.id} href={`/plans?tab=${t.id}`} className={`ptab ${tab === t.id ? "is-on" : ""}`} aria-current={tab === t.id ? "page" : undefined}>
            <span>{t.name}</span>
            <strong>{counts[t.id]}</strong>
          </Link>
        ))}
      </nav>

      {tab === "company" ? (
        <form action={payCompanyAction} className="card form form-big">
          <div className="summary-label">Нужно отдать компании за товар</div>
          <div className="summary-value">{formatMoney(Math.max(0, debt))}</div>
          <p className="muted small" style={{ margin: 0 }}>
            Это деньги компании, которые пришли вам с продаж. Отдали — запишите здесь, и долг уменьшится. Продажи — во вкладке{" "}
            <Link href="/sales" className="link">Продажи</Link>.
          </p>
          <input type="hidden" name="next" value="/plans?tab=company" />
          <label className="amount-field">
            <input name="amount" inputMode="decimal" defaultValue={debt > 0 ? debt / 100 : ""} required className="amount-input" aria-label="Сумма, ₴" placeholder="0" />
            <span className="amount-cur" aria-hidden>₴</span>
          </label>
          <AccountChips label="Откуда отдали" none="Наличными, без кассы" />
          <button className="btn btn-primary btn-big">Отдал компании</button>
        </form>
      ) : (
        <>
          {open.length === 0 && (
            <div className="empty">
              <div className="empty-icon">{isIn ? "🤝" : "📅"}</div>
              <strong>{isIn ? "Вам никто не должен" : "Запланированных платежей нет"}</strong>
              <p>
                {isIn
                  ? "Запишите, если вам должны вернуть деньги, — D&N отметит, когда они придут."
                  : "Аренда, кредит, ремонт — запишите заранее, и D&N напомнит в день оплаты."}
              </p>
            </div>
          )}
          {groups
            .filter(([, list]) => list.length)
            .map(([title, list]) => (
              <section key={title}>
                <h2 className={title === "Просрочено" ? "danger" : undefined}>{title}</h2>
                <div className="card plan-list">
                  {list.map((p) => (
                    <PlanRow key={p.id} p={p} today={today} />
                  ))}
                </div>
              </section>
            ))}

          <details className="card settings-fold add-fold" id="new" open={Boolean(openNew) || open.length === 0}>
            <summary>{isIn ? "+ Мне должны" : "+ Новый платёж"}</summary>
            <form action={createPlanAction} className="form form-big" style={{ marginTop: 14 }}>
              <input type="hidden" name="direction" value={tab} />
              <input type="hidden" name="next" value={`/plans?tab=${tab}`} />
              <label className="amount-field">
                <input name="total" inputMode="decimal" required className="amount-input" placeholder="0" aria-label="Сумма, ₴" />
                <span className="amount-cur" aria-hidden>₴</span>
              </label>
              <label>
                {isIn ? "Кто и за что должен" : "Что оплатить"}
                <input name="title" required placeholder={isIn ? "например, Олег — вернуть долг" : "например, Аренда квартиры"} />
              </label>
              <label>
                {isIn ? "Когда ждать" : "Когда оплатить"}
                <input name="due" type="date" />
              </label>
              {!isIn && <CenterChips label="Направление" withNone="Выберу позже" includeInternal={false} />}
              <AccountChips label={isIn ? "Куда придут деньги" : "Откуда будете платить"} none="Решу потом" />
              <label className="switch">
                <input type="checkbox" name="repeat" value="month" />
                <span className="switch-ui" aria-hidden />
                <span>Повторять каждый месяц</span>
              </label>
              <details className="more-fields">
                <summary>Часть уже {isIn ? "получена" : "оплачена"}, комментарий</summary>
                <div className="form">
                  <label>
                    {isIn ? "Уже получено, ₴" : "Уже оплачено, ₴"}
                    <input name="advance" inputMode="decimal" placeholder="например, 2000" />
                  </label>
                  <label>
                    Комментарий
                    <input name="note" />
                  </label>
                </div>
              </details>
              <button className="btn btn-primary btn-big">{isIn ? "Добавить" : "Запланировать"}</button>
            </form>
          </details>

          {done.length > 0 && (
            <section>
              <h2>{isIn ? "Получено недавно" : "Оплачено недавно"}</h2>
              <div className="card plan-list">
                {done.map((p) => (
                  <Link key={p.id} href={`/plans/${p.id}`} className="plan-row is-done">
                    <span className="date-tile is-done">✓</span>
                    <span className="plan-main">
                      <strong>{p.title}</strong>
                      <span className="plan-due">нажмите, чтобы посмотреть или отменить</span>
                    </span>
                    <span className="plan-amount muted">{formatMoney(p.total)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
