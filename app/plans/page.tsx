import { Hint } from "../components/Hint.tsx";
import Link from "next/link";
import { createPlanAction, payCompanyAction } from "../actions.ts";
import { AccountSelect } from "../components/AccountSelect.tsx";
import { CenterSelect } from "../components/CenterSelect.tsx";
import { formatMoney } from "@/lib/money.ts";
import { listPlans, ymd, type Plan } from "@/lib/plans.ts";
import { companyDebt } from "@/lib/sales.ts";

const DAY = 864e5;
function dueInfo(p: Plan, today: string) {
  if (!p.due_date) return { cls: "", text: "без даты" };
  const days = Math.round((new Date(`${p.due_date}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / DAY);
  const date = new Date(`${p.due_date}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  if (days < 0) return { cls: "due-over", text: `просрочено на ${-days} дн. · ${date}` };
  if (days === 0) return { cls: "due-today", text: "сегодня" };
  if (days === 1) return { cls: "due-soon", text: "завтра" };
  if (days <= 7) return { cls: "due-soon", text: `через ${days} дн. · ${date}` };
  return { cls: "", text: date };
}

function PlanRow({ p, today }: { p: Plan; today: string }) {
  const d = dueInfo(p, today);
  const left = p.total - p.paid;
  return (
    <Link href={`/plans/${p.id}`} className={`card plan ${d.cls}`}>
      <div className="row-between">
        <strong>{p.title}</strong>
        <strong className={p.direction === "in" ? "pos-text" : undefined}>{formatMoney(left)}</strong>
      </div>
      <div className="muted small">
        <span className={`due ${d.cls}`}>{d.text}</span>
        {p.repeat === "month" && " · каждый месяц"}
        {p.note && ` · ${p.note}`}
      </div>
      {p.paid > 0 && (
        <>
          <div className="limit-track">
            <div className="limit-fill" style={{ width: `${Math.min(100, (p.paid / p.total) * 100)}%`, background: "var(--green)" }} />
          </div>
          <div className="muted small">
            {p.direction === "in" ? "получено" : "оплачено"} {formatMoney(p.paid)} из {formatMoney(p.total)}
          </div>
        </>
      )}
    </Link>
  );
}

const TABS = [
  { id: "out", name: "Я плачу" },
  { id: "in", name: "Мне должны" },
  { id: "company", name: "Долг компании" },
] as const;

export default async function Plans({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab = TABS.find((t) => t.id === rawTab)?.id ?? "out";
  const today = ymd(new Date());
  const week = ymd(new Date(Date.now() + 7 * DAY));
  const outOpen = listPlans("open", 200, "out");
  const inOpen = listPlans("open", 200, "in");
  const debt = companyDebt();
  const sum = (l: Plan[]) => l.reduce((a, p) => a + p.total - p.paid, 0);
  const counts: Record<string, string> = { out: formatMoney(sum(outOpen)), in: formatMoney(sum(inOpen)), company: formatMoney(Math.max(0, debt)) };

  const open = tab === "in" ? inOpen : outOpen;
  const done = tab === "company" ? [] : listPlans("done", 15, tab);
  const groups: [string, Plan[]][] = [
    ["Просрочено", open.filter((p) => p.due_date && p.due_date < today)],
    ["Сегодня", open.filter((p) => p.due_date === today)],
    ["На неделе", open.filter((p) => p.due_date && p.due_date > today && p.due_date <= week)],
    ["Позже", open.filter((p) => p.due_date && p.due_date > week)],
    ["Без даты", open.filter((p) => !p.due_date)],
  ];
  const isIn = tab === "in";

  return (
    <div className="narrow-wide">
      <h1>Платежи</h1>
      <Hint>Что нужно оплатить, кто должен вам и сколько отдать компании. Напомним в Telegram в день оплаты.</Hint>
      <nav className="ptabs" aria-label="Разделы платежей">
        {TABS.map((t) => (
          <Link key={t.id} href={`/plans?tab=${t.id}`} className={`ptab ${tab === t.id ? "is-on" : ""}`} aria-current={tab === t.id ? "page" : undefined}>
            <span>{t.name}</span>
            <strong>{counts[t.id]}</strong>
          </Link>
        ))}
      </nav>

      {tab === "company" ? (
        <form action={payCompanyAction} className="card form">
          <h2>Долг компании: {formatMoney(Math.max(0, debt))}</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Деньги за товар компании, которые пришли вам. Отдали — запишите здесь, долг уменьшится. Это не ваш расход. Продажи — в разделе{" "}
            <Link href="/sales" className="link">Продажи</Link>.
          </p>
          <input type="hidden" name="next" value="/plans?tab=company" />
          <div className="grid-2-tight">
            <label>
              Сумма, ₴
              <input name="amount" inputMode="decimal" defaultValue={debt > 0 ? debt / 100 : ""} required />
            </label>
            <label>
              Откуда
              <AccountSelect none="наличными / не указано" />
            </label>
          </div>
          <button className="btn btn-primary">Передал компании</button>
        </form>
      ) : (
        <>
          {open.length === 0 && (
            <div className="card">
              <strong>{isIn ? "Никто ничего не должен" : "Запланированных платежей нет"}</strong>
              <p className="muted small">
                {isIn
                  ? "Добавьте, если вам должны вернуть деньги или заплатить: D&N отметит, когда деньги придут."
                  : "Добавьте ниже: название, сумма, когда. Можно сразу внести часть суммы."}
              </p>
            </div>
          )}
          {groups
            .filter(([, list]) => list.length)
            .map(([title, list]) => (
              <section key={title}>
                <h2 className={title === "Просрочено" ? "danger" : undefined}>{title}</h2>
                {list.map((p) => (
                  <PlanRow key={p.id} p={p} today={today} />
                ))}
              </section>
            ))}

          <form action={createPlanAction} className="card form" id="new">
            <h2>{isIn ? "Мне должны" : "Новый платёж"}</h2>
            <input type="hidden" name="direction" value={tab} />
            <input type="hidden" name="next" value={`/plans?tab=${tab}`} />
            <label>
              Название
              <input name="title" required placeholder={isIn ? "например, Вернуть долг — Олег" : "например, Аренда квартиры"} />
            </label>
            <div className="grid-2-tight">
              <label>
                Сумма, ₴
                <input name="total" inputMode="decimal" required placeholder={isIn ? "5000" : "12000"} />
              </label>
              <label>
                {isIn ? "Когда ждать" : "Когда оплатить"}
                <input name="due" type="date" />
              </label>
            </div>
            <label>
              {isIn ? "Уже получено, ₴ (необязательно)" : "Уже оплачено, ₴ (необязательно)"}
              <input name="advance" inputMode="decimal" placeholder="например, 2000" />
            </label>
            <label>
              {isIn ? "Куда придут деньги" : "С какой карты или кассы"}
              <AccountSelect none="— выберу потом —" />
            </label>
            {!isIn && (
              <label>
                Категория расхода
                <CenterSelect />
              </label>
            )}
            <label className="check">
              <input type="checkbox" name="repeat" value="month" /> Повторять каждый месяц
            </label>
            <label>
              Комментарий
              <input name="note" placeholder="необязательно" />
            </label>
            <button className="btn btn-primary">Добавить</button>
          </form>

          {done.length > 0 && (
            <section>
              <h2>{isIn ? "Получено недавно" : "Оплачено недавно"}</h2>
              <div className="card">
                {done.map((p) => (
                  <Link key={p.id} href={`/plans/${p.id}`} className="row-between tree-row plain">
                    <span>✓ {p.title}</span>
                    <span className="muted">{formatMoney(p.total)}</span>
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
