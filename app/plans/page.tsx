import Link from "next/link";
import { createPlanAction } from "../actions.ts";
import { AccountSelect } from "../components/AccountSelect.tsx";
import { CenterSelect } from "../components/CenterSelect.tsx";
import { formatMoney } from "@/lib/money.ts";
import { listPlans, ymd, type Plan } from "@/lib/plans.ts";

const DAY = 864e5;
function dueInfo(p: Plan, today: string) {
  if (!p.due_date) return { cls: "", text: "без даты" };
  const days = Math.round((new Date(`${p.due_date}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / DAY);
  const date = new Date(`${p.due_date}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  if (days < 0) return { cls: "due-over", text: `просрочен на ${-days} дн. · ${date}` };
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
        <strong>{formatMoney(left)}</strong>
      </div>
      <div className="muted small">
        {p.payee && <>{p.payee} · </>}
        <span className={`due ${d.cls}`}>{d.text}</span>
        {p.repeat === "month" && " · каждый месяц"}
      </div>
      {p.paid > 0 && (
        <>
          <div className="limit-track">
            <div className="limit-fill" style={{ width: `${Math.min(100, (p.paid / p.total) * 100)}%`, background: "var(--green)" }} />
          </div>
          <div className="muted small">
            оплачено {formatMoney(p.paid)} из {formatMoney(p.total)}
          </div>
        </>
      )}
    </Link>
  );
}

export default function Plans() {
  const today = ymd(new Date());
  const open = listPlans("open");
  const done = listPlans("done", 15);
  const week = ymd(new Date(Date.now() + 7 * DAY));
  const groups: [string, Plan[]][] = [
    ["Просрочено", open.filter((p) => p.due_date && p.due_date < today)],
    ["Сегодня", open.filter((p) => p.due_date === today)],
    ["На неделе", open.filter((p) => p.due_date && p.due_date > today && p.due_date <= week)],
    ["Позже", open.filter((p) => p.due_date && p.due_date > week)],
    ["Без даты", open.filter((p) => !p.due_date)],
  ];
  const totalLeft = open.reduce((a, p) => a + p.total - p.paid, 0);

  return (
    <div className="narrow-wide">
      <h1>Платежи</h1>
      <p className="muted small" style={{ marginTop: -6 }}>
        Запланированные оплаты и покупки с оплатой частями. Всего к оплате: <strong>{formatMoney(totalLeft)}</strong>.
      </p>
      {open.length === 0 && (
        <div className="card">
          <strong>Запланированных платежей нет</strong>
          <p className="muted small">Добавьте ниже: кому, сколько и когда. Можно сразу внести аванс.</p>
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
        <h2>Новый платёж</h2>
        <label>
          За что
          <input name="title" required placeholder="например, Бампер на машину" />
        </label>
        <label>
          Кому
          <input name="payee" placeholder="например, СТО «Авто-Сервис»" />
        </label>
        <div className="grid-2-tight">
          <label>
            Сумма, ₴
            <input name="total" inputMode="decimal" required placeholder="55000" />
          </label>
          <label>
            Когда оплатить
            <input name="due" type="date" />
          </label>
        </div>
        <label>
          Аванс уже внесён, ₴ (необязательно)
          <input name="advance" inputMode="decimal" placeholder="например, 10000" />
        </label>
        <label>
          Платить с
          <AccountSelect none="— выберу при оплате —" />
        </label>
        <label>
          Категория
          <CenterSelect />
        </label>
        <label className="check">
          <input type="checkbox" name="repeat" value="month" /> Повторять каждый месяц
        </label>
        <label>
          Комментарий
          <input name="note" />
        </label>
        <button className="btn btn-primary">Добавить платёж</button>
      </form>

      {done.length > 0 && (
        <section>
          <h2>Оплачено недавно</h2>
          <div className="card">
            {done.map((p) => (
              <Link key={p.id} href={`/plans/${p.id}`} className="row-between tree-row plain">
                <span>
                  ✓ {p.title}
                  {p.payee && <span className="muted small"> · {p.payee}</span>}
                </span>
                <span className="muted">{formatMoney(p.total)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
