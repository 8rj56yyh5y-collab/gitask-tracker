import { Hint } from "../components/Hint.tsx";
import Link from "next/link";
import { deleteSaleAction, payCompanyAction } from "../actions.ts";
import { AccountSelect } from "../components/AccountSelect.tsx";
import { formatMoney } from "@/lib/money.ts";
import { monthDate, monthKey, shiftMonth } from "@/lib/repo.ts";
import { companyDebt, salesMonth } from "@/lib/sales.ts";

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

export default async function Sales({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const d = monthDate(m);
  const key = monthKey(d);
  const isCurrent = key === monthKey(new Date());
  const s = salesMonth(d);
  const debt = companyDebt();
  const name = d.toLocaleDateString("ru-RU", { month: "long" });
  const title = `${name[0].toUpperCase()}${name.slice(1)} ${d.getFullYear()}`;

  return (
    <div className="narrow-wide">
      <div className="row-between">
        <h1 style={{ margin: 0 }}>Продажи</h1>
        <Link href="/sales/new" className="btn btn-primary btn-sm">
          + Продажа
        </Link>
      </div>
      <Hint>Продажа товара компании: ваша комиссия — ваш доход, остальное — долг компании, пока не отдадите.</Hint>
      <div className="month-switch" style={{ margin: "12px 0" }}>
        <Link href={`/sales?m=${monthKey(shiftMonth(d, -1))}`} className="btn btn-sm" aria-label="Предыдущий месяц">‹</Link>
        <strong>{title}</strong>
        {isCurrent ? <span className="btn btn-sm btn-disabled" aria-hidden>›</span> : <Link href={`/sales?m=${monthKey(shiftMonth(d, 1))}`} className="btn btn-sm" aria-label="Следующий месяц">›</Link>}
      </div>

      <section className="card">
        <div className="kpis">
          <div>
            <div className="muted small">Продано</div>
            <div className="big">{formatMoney(s.total)}</div>
            <div className="muted small">{s.list.length} {plural(s.list.length, "продажа", "продажи", "продаж")}</div>
          </div>
          <div>
            <div className="muted small">Ваш доход (комиссия отдела)</div>
            <div className="big" style={{ color: "var(--green)" }}>{formatMoney(s.commission)}</div>
          </div>
          <div>
            <div className="muted small">Маркетплейсы</div>
            <div className="big">{formatMoney(s.mpFee)}</div>
          </div>
          <div>
            <div className="muted small">Доля компании</div>
            <div className="big">{formatMoney(s.company)}</div>
            <div className="muted small">передано за месяц {formatMoney(s.handed)}</div>
          </div>
        </div>
      </section>

      <form action={payCompanyAction} className={`card form ${debt > 0 ? "alert-budget" : ""}`}>
        <h2>Долг компании: {formatMoney(Math.max(0, debt))}</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Деньги за товар, которые пришли вам, но принадлежат компании. Отдали — запишите здесь, долг уменьшится. Это не ваш расход.
        </p>
        <input type="hidden" name="next" value="/sales" />
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
        <button className="btn">Передал компании</button>
      </form>

      {s.byProduct.length > 0 && (
        <section className="card">
          <h2>По товарам</h2>
          <div className="tbl">
            <table className="compare">
              <thead>
                <tr><th>Товар</th><th>Кол-во</th><th>Сумма</th><th>Ваш доход</th></tr>
              </thead>
              <tbody>
                {s.byProduct.map((x) => (
                  <tr key={x.name}>
                    <td>{x.name}</td>
                    <td>{x.qty}</td>
                    <td>{formatMoney(x.total)}</td>
                    <td>{formatMoney(x.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <div className="row-between">
          <h2 style={{ margin: 0 }}>Продажи за месяц</h2>
          <Link href="/sales/catalog" className="btn btn-ghost btn-sm">Каталог и ставки ›</Link>
        </div>
        {s.list.length === 0 && <p className="muted small">Продаж нет. Нажмите «+ Продажа».</p>}
        {s.list.map((x) => (
          <div key={x.id} className="tx">
            <div className="tx-main">
              <div className="tx-title">
                {x.product_name} × {x.qty}
              </div>
              <div className="muted small">
                {new Date(x.at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} · {x.channel === "mp" ? `маркетплейс ${x.mp_rate}%` : "вживую"} · ваш доход {formatMoney(x.commission)} · компании {formatMoney(x.company_share)}
                {x.note && ` · ${x.note}`}
              </div>
            </div>
            <div className="tx-amount pos">{formatMoney(x.total)}</div>
            <form action={deleteSaleAction}>
              <input type="hidden" name="id" value={x.id} />
              <button className="btn btn-ghost btn-sm" title="Удалить продажу" aria-label="Удалить продажу">✕</button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
