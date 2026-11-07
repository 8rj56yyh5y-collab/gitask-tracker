import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelPlanAction, payPlanAction, updatePlanAction } from "../../actions.ts";
import { AccountSelect } from "../../components/AccountSelect.tsx";
import { CenterSelect } from "../../components/CenterSelect.tsx";
import { TxRow } from "../../components/TxRow.tsx";
import { getDb } from "@/lib/db.ts";
import { formatMoney } from "@/lib/money.ts";
import { getPlan } from "@/lib/plans.ts";
import type { Tx } from "@/lib/repo.ts";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const p = getPlan(Number(raw));
  if (!p) notFound();
  const left = p.total - p.paid;
  const acc = p.card_id ? `card:${p.card_id}` : p.cashbox_id ? `cash:${p.cashbox_id}` : "";
  const payments = getDb()
    .prepare(
      `SELECT t.*, c.bank || ' *' || c.last4 AS card_label, c.bank AS card_bank, c.color AS card_color, c.badge AS card_badge, cb.name AS cashbox_name
       FROM transactions t LEFT JOIN cards c ON c.id = t.card_id LEFT JOIN cashboxes cb ON cb.id = t.cashbox_id
       WHERE t.plan_id = ? ORDER BY t.occurred_at DESC`,
    )
    .all(p.id) as unknown as Tx[];

  return (
    <div className="narrow-wide">
      <div className="muted small">
        <Link href="/plans">Платежи</Link>
      </div>
      <h1>{p.title}</h1>
      <section className="card">
        <div className="muted small">{p.payee || "получатель не указан"}{p.due_date && ` · до ${new Date(`${p.due_date}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`}{p.repeat === "month" && " · каждый месяц"}</div>
        <div className="big" style={{ marginTop: 6 }}>{p.status === "open" ? `Осталось ${formatMoney(left)}` : p.status === "done" ? "Оплачено ✓" : "Отменён"}</div>
        <div className="limit-track">
          <div className="limit-fill" style={{ width: `${Math.min(100, (p.paid / p.total) * 100)}%`, background: "var(--green)" }} />
        </div>
        <div className="muted small">
          оплачено {formatMoney(p.paid)} из {formatMoney(p.total)}
        </div>
      </section>

      {p.status === "open" && (
        <form action={payPlanAction} className="card form">
          <h2>Оплатить</h2>
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="next" value={`/plans/${p.id}`} />
          <label>
            Сумма, ₴ — всё или часть
            <input name="amount" inputMode="decimal" defaultValue={left / 100} required />
          </label>
          <label>
            С какой карты или кассы
            <AccountSelect defaultValue={acc} none="наличные / не указано" />
          </label>
          <label>
            Дата
            <input name="at" type="date" />
          </label>
          <button className="btn btn-primary">Записать оплату</button>
          <p className="muted small" style={{ margin: 0 }}>
            Если платите с Monobank или Apple Pay — можно ничего не нажимать: когда придёт операция на {formatMoney(left)} около даты платежа, D&amp;N
            отметит его сам.
          </p>
        </form>
      )}

      <section className="card">
        <h2>Оплаты</h2>
        {payments.length === 0 && <p className="muted small">Оплат пока не было.</p>}
        {payments.map((t) => (
          <Link key={t.id} href={`/inbox/${t.id}`} className="plain">
            <TxRow tx={t} />
          </Link>
        ))}
      </section>

      <form action={updatePlanAction} className="card form">
        <h2>Изменить</h2>
        <input type="hidden" name="id" value={p.id} />
        <input type="hidden" name="next" value={`/plans/${p.id}`} />
        <label>
          За что
          <input name="title" defaultValue={p.title} required />
        </label>
        <label>
          Кому
          <input name="payee" defaultValue={p.payee} />
        </label>
        <div className="grid-2-tight">
          <label>
            Сумма, ₴
            <input name="total" inputMode="decimal" defaultValue={p.total / 100} required />
          </label>
          <label>
            Когда оплатить
            <input name="due" type="date" defaultValue={p.due_date ?? ""} />
          </label>
        </div>
        <label>
          Платить с
          <AccountSelect defaultValue={acc} none="— выберу при оплате —" />
        </label>
        <label>
          Категория
          <CenterSelect defaultValue={p.cost_center_id} />
        </label>
        <label className="check">
          <input type="checkbox" name="repeat" value="month" defaultChecked={p.repeat === "month"} /> Повторять каждый месяц
        </label>
        <label>
          Комментарий
          <input name="note" defaultValue={p.note} />
        </label>
        <button className="btn">Сохранить</button>
      </form>
      {p.status === "open" && (
        <form action={cancelPlanAction}>
          <input type="hidden" name="id" value={p.id} />
          <button className="btn btn-ghost btn-sm danger">Отменить платёж</button>
        </form>
      )}
    </div>
  );
}
