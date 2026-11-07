import { Hint } from "../components/Hint.tsx";
import Link from "next/link";
import { createCashboxAction, transferAction } from "../actions.ts";
import { AccountSelect } from "../components/AccountSelect.tsx";
import { CenterSelect } from "../components/CenterSelect.tsx";
import { listCenters } from "@/lib/repo.ts";
import { cashBalances, listCashboxes } from "@/lib/cash.ts";
import { formatMoney } from "@/lib/money.ts";

export default function Cash() {
  const boxes = listCashboxes();
  const bal = cashBalances();
  const centerName = new Map(listCenters().map((c) => [c.id, c.name]));
  const total = boxes.reduce((a, b) => a + (bal.get(b.id) ?? 0), 0);
  return (
    <div className="narrow-wide">
      <h1>Кассы</h1>
      <Hint>Наличные деньги. Каждая касса — отдельный кошелёк со своим остатком.</Hint>
      {boxes.length > 0 && (
        <p className="muted small" style={{ marginTop: -6 }}>
          Наличных во всех кассах: <strong>{formatMoney(total)}</strong>
        </p>
      )}
      {boxes.map((b) => (
        <Link key={b.id} href={`/cash/${b.id}`} className="cashbox-tile" style={{ "--c": b.color } as React.CSSProperties}>
          <div className="row-between">
            <strong>{b.name}</strong>
            <span className="small">{b.owner}</span>
          </div>
          <div className="big">{formatMoney(bal.get(b.id) ?? 0)}</div>
          <div className="small" style={{ opacity: 0.85 }}>
            {b.center_id && centerName.has(b.center_id) ? `${centerName.get(b.center_id)} · ` : ""}нажмите, чтобы внести приход или расход
          </div>
        </Link>
      ))}
      {boxes.length === 0 && (
        <div className="card">
          <strong>Касс пока нет</strong>
          <p className="muted small">Например: «Домашняя», «Офис», «Магазин». У каждой будет свой остаток.</p>
        </div>
      )}

      {boxes.length > 0 && (
        <form action={transferAction} className="card form">
          <h2>Перевод</h2>
          <p className="muted small" style={{ margin: 0 }}>Между кассами или с карты в кассу (снял наличные) — это не расход.</p>
          <input type="hidden" name="next" value="/cash" />
          <div className="grid-2-tight">
            <label>
              Откуда
              <AccountSelect name="from" />
            </label>
            <label>
              Куда
              <AccountSelect name="to" />
            </label>
          </div>
          <label>
            Сумма, ₴
            <input name="amount" inputMode="decimal" required />
          </label>
          <label>
            Комментарий
            <input name="note" placeholder="например, снял в банкомате" />
          </label>
          <button className="btn">Перевести</button>
        </form>
      )}

      <form action={createCashboxAction} className="card form">
        <h2>Новая касса</h2>
        <label>
          Название
          <input name="name" required placeholder="например, Домашняя" />
        </label>
        <label>
          Чья
          <input name="owner" placeholder="например, Анна" />
        </label>
        <div className="grid-2-tight">
          <label>
            Сейчас в кассе, ₴
            <input name="opening" inputMode="decimal" placeholder="0" />
          </label>
          <label>
            Цвет
            <input name="color" type="color" defaultValue="#16a34a" />
          </label>
        </div>
        <label>
          Направление кассы
          <CenterSelect none="— для разных —" />
        </label>
        <p className="muted small" style={{ margin: 0 }}>
          Например, касса отдела продаж — направление «Отдел продаж»: расходы из неё сразу записываются туда. Для отдельной траты его можно
          поменять.
        </p>
        <button className="btn btn-primary">Создать кассу</button>
      </form>
    </div>
  );
}
