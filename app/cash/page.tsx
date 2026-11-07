import Link from "next/link";
import { createCashboxAction } from "../actions.ts";
import { CenterChips } from "../components/Pickers.tsx";
import { cashBalances, cashMonthTotals, listCashboxes } from "@/lib/cash.ts";
import { formatMoney } from "@/lib/money.ts";
import { listCenters } from "@/lib/repo.ts";

export default async function Cash({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: openNew } = await searchParams;
  const boxes = listCashboxes();
  const bal = cashBalances();
  const month = cashMonthTotals();
  const centers = new Map(listCenters().map((c) => [c.id, c]));
  const total = boxes.reduce((a, b) => a + (bal.get(b.id) ?? 0), 0);
  const mIn = boxes.reduce((a, b) => a + (month.get(b.id)?.in ?? 0), 0);
  const mOut = boxes.reduce((a, b) => a + (month.get(b.id)?.out ?? 0), 0);
  const monthName = new Date().toLocaleDateString("ru-RU", { month: "long" });

  return (
    <div className="narrow-wide">
      <div className="page-head">
        <h1>Кассы</h1>
        <Link href="/cash?new=1#new" className="btn btn-primary btn-sm">
          + Касса
        </Link>
      </div>

      <section className="summary-hero">
        <div className="summary-label">Наличных во всех кассах</div>
        <div className="summary-value">{formatMoney(total)}</div>
        <div className="summary-row">
          <span>
            За {monthName}: <b className="pos-text">+{formatMoney(mIn)}</b>
          </span>
          <span>
            <b>−{formatMoney(mOut)}</b>
          </span>
        </div>
      </section>

      {boxes.length === 0 && (
        <div className="empty">
          <div className="empty-icon">💵</div>
          <strong>Касс пока нет</strong>
          <p>Касса — это наличные: дома, в офисе, у отдела. У каждой свой остаток и своя история.</p>
        </div>
      )}

      <div className="box-grid">
        {boxes.map((b) => {
          const m = month.get(b.id) ?? { in: 0, out: 0 };
          const c = b.center_id ? centers.get(b.center_id) : undefined;
          return (
            <Link key={b.id} href={`/cash/${b.id}`} className="box-tile" style={{ "--c": b.color } as React.CSSProperties}>
              <div className="box-tile-top">
                <span className="box-tile-name">{b.name}</span>
                {c && c.name !== b.name && <span className="box-tile-tag">{c.name}</span>}
              </div>
              <div className="box-tile-balance">{formatMoney(bal.get(b.id) ?? 0)}</div>
              <div className="box-tile-month">
                <span>+{formatMoney(m.in)}</span>
                <span>−{formatMoney(m.out)}</span>
              </div>
            </Link>
          );
        })}
      </div>

      <details className="card settings-fold" id="new" open={Boolean(openNew) || boxes.length === 0}>
        <summary>Новая касса</summary>
        <form action={createCashboxAction} className="form" style={{ marginTop: 14 }}>
          <label>
            Название
            <input name="name" required placeholder="например, Домашняя" />
          </label>
          <label>
            Сколько в ней сейчас, ₴
            <input name="opening" inputMode="decimal" placeholder="0" />
          </label>
          <CenterChips label="Чьи это деньги (направление)" withNone="Разные" includeInternal={false} />
          <div className="grid-2-tight">
            <label>
              Чья касса
              <input name="owner" placeholder="необязательно" />
            </label>
            <label>
              Цвет
              <input name="color" type="color" defaultValue="#16a34a" />
            </label>
          </div>
          <button className="btn btn-primary btn-big">Создать кассу</button>
        </form>
      </details>
    </div>
  );
}
