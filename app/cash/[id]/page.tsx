import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveCashboxAction, cashMoveAction, transferAction, updateCashboxAction } from "../../actions.ts";
import { AccountSelect } from "../../components/AccountSelect.tsx";
import { CenterSelect } from "../../components/CenterSelect.tsx";
import { TxRow } from "../../components/TxRow.tsx";
import { cashBalances, getCashbox } from "@/lib/cash.ts";
import { getDb } from "@/lib/db.ts";
import { formatMoney } from "@/lib/money.ts";
import { listPlans } from "@/lib/plans.ts";
import { monthBounds, type Tx } from "@/lib/repo.ts";

export default async function CashboxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const b = getCashbox(Number(raw));
  if (!b || b.archived) notFound();
  const balance = cashBalances().get(b.id) ?? 0;
  const { from, to } = monthBounds();
  const moves = getDb()
    .prepare(
      `SELECT t.*, cc.name AS center_name, cc.color AS center_color, cb.name AS cashbox_name FROM transactions t
       LEFT JOIN cost_centers cc ON cc.id = t.cost_center_id LEFT JOIN cashboxes cb ON cb.id = t.cashbox_id
       WHERE t.cashbox_id = ? ORDER BY t.occurred_at DESC LIMIT 200`,
    )
    .all(b.id) as unknown as Tx[];
  const month = moves.filter((t) => t.occurred_at >= from && t.occurred_at < to);
  const inM = month.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const outM = month.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0);
  const plans = listPlans("open");
  const next = `/cash/${b.id}`;

  return (
    <div className="narrow-wide">
      <div className="muted small">
        <Link href="/cash">Кассы</Link>
      </div>
      <h1>{b.name}</h1>
      <div className="cashbox-tile" style={{ "--c": b.color } as React.CSSProperties}>
        <div className="small" style={{ opacity: 0.85 }}>{b.owner || "остаток"}</div>
        <div className="big">{formatMoney(balance)}</div>
        <div className="small" style={{ opacity: 0.85 }}>
          за месяц: приход {formatMoney(inM)} · расход {formatMoney(outM)}
        </div>
      </div>

      <form action={cashMoveAction} className="card form">
        <h2>Приход или расход</h2>
        <input type="hidden" name="id" value={b.id} />
        <input type="hidden" name="next" value={next} />
        <div className="seg2">
          <label>
            <input type="radio" name="dir" value="out" defaultChecked /> Расход
          </label>
          <label>
            <input type="radio" name="dir" value="in" /> Приход
          </label>
        </div>
        <label>
          Сумма, ₴
          <input name="amount" inputMode="decimal" required className="amount-input" placeholder="0" />
        </label>
        <label>
          Название
          <input name="who" placeholder="например, Продукты или Зарплата" />
        </label>
        <label>
          Комментарий
          <input name="note" placeholder="необязательно" />
        </label>
        <label>
          Направление расхода
          <CenterSelect defaultValue={b.center_id} none="— выберу позже —" />
        </label>
        {plans.length > 0 && (
          <label>
            Это оплата по платежу (необязательно)
            <select name="planId" defaultValue="">
              <option value="">— нет —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} · осталось {formatMoney(p.total - p.paid)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Дата
          <input name="at" type="date" />
        </label>
        <button className="btn btn-primary">Записать</button>
      </form>

      <form action={transferAction} className="card form">
        <h2>Перевод из этой кассы</h2>
        <input type="hidden" name="from" value={`cash:${b.id}`} />
        <input type="hidden" name="next" value={next} />
        <label>
          Куда
          <AccountSelect name="to" />
        </label>
        <label>
          Сумма, ₴
          <input name="amount" inputMode="decimal" required />
        </label>
        <label>
          Комментарий
          <input name="note" />
        </label>
        <button className="btn">Перевести</button>
      </form>

      <section className="card">
        <h2>Операции кассы</h2>
        {moves.length === 0 && <p className="muted small">Пока ничего не было.</p>}
        {moves.map((t) => (
          <Link key={t.id} href={`/inbox/${t.id}`} className="plain">
            <TxRow tx={t} />
          </Link>
        ))}
      </section>

      <form action={updateCashboxAction} className="card form">
        <h2>Настройки кассы</h2>
        <input type="hidden" name="id" value={b.id} />
        <input type="hidden" name="next" value={next} />
        <label>
          Название
          <input name="name" defaultValue={b.name} required />
        </label>
        <label>
          Чья
          <input name="owner" defaultValue={b.owner} />
        </label>
        <label>
          Направление кассы
          <CenterSelect defaultValue={b.center_id} none="— для разных —" />
        </label>
        <div className="grid-2-tight">
          <label>
            Начальный остаток, ₴
            <input name="opening" inputMode="decimal" defaultValue={b.opening / 100} />
          </label>
          <label>
            Цвет
            <input name="color" type="color" defaultValue={b.color} />
          </label>
        </div>
        <button className="btn">Сохранить</button>
      </form>
      <form action={archiveCashboxAction}>
        <input type="hidden" name="id" value={b.id} />
        <button className="btn btn-ghost btn-sm danger">Скрыть кассу</button>
      </form>
    </div>
  );
}
