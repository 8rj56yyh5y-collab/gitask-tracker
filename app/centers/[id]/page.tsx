import Link from "next/link";
import { notFound } from "next/navigation";
import { addCenter, createCenterCashboxAction, removeCenter, updateCenterAction, updateCenterBudget } from "../../actions.ts";
import { BudgetLine } from "../../components/BudgetLine.tsx";
import { TxRow } from "../../components/TxRow.tsx";
import { centerStats, centerTransactions, centerTree, childStats, getCenter } from "@/lib/repo.ts";
import { formatMoney } from "@/lib/money.ts";
import { dailyAllowance } from "@/lib/budget.ts";
import { cashBalances, listCashboxes } from "@/lib/cash.ts";

export default async function CenterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = Number(raw);
  const center = getCenter(id);
  if (!center) notFound();
  const today = new Date();
  const stats = centerStats(today);
  const s = stats.get(id)!;
  const children = childStats(id, today);
  const txs = centerTransactions(id, today);
  const parent = center.parent_id ? stats.get(center.parent_id) : null;
  const month = today.toLocaleDateString("ru-RU", { month: "long" });
  const daily = s.budget > 0 && s.status !== "over" ? dailyAllowance(s.spent, s.budget, today) : null;

  return (
    <div className="grid grid-2">
      <div className="span-all">
        <div className="muted small">
          <Link href="/centers">Направления</Link>
          {parent && (
            <>
              {" › "}
              <Link href={`/centers/${parent.id}`}>{parent.name}</Link>
            </>
          )}
        </div>
        <h1>
          <i className="dot dot-lg" style={{ background: center.color }} />
          {center.name}
        </h1>
      </div>

      <section className="card">
        <h2>Потрачено за {month}</h2>
        <div className="big">{formatMoney(s.spent)}</div>
        <BudgetLine s={{ ...s, name: s.budget > 0 ? "Лимит на месяц" : "Без лимита" }} total={s.spent} />
        {daily !== null && (
          <p className="small">
            Чтобы уложиться в лимит, тратьте не больше <strong>{formatMoney(daily)} в день</strong> до конца месяца.
          </p>
        )}
        <form action={updateCenterBudget} className="form limit-form">
          <input type="hidden" name="id" value={id} />
          <label>
            Сколько можно тратить в месяц, ₴
            <span className="input-row">
              <input name="budget" inputMode="decimal" placeholder="без лимита" defaultValue={center.monthly_budget ? center.monthly_budget / 100 : ""} />
              <button className="btn btn-sm">Сохранить</button>
            </span>
          </label>
        </form>
      </section>

      {!center.is_internal &&
        (() => {
          const boxes = listCashboxes().filter((b) => b.center_id === id);
          const bal = cashBalances();
          return (
            <section className="card">
              <h2>Касса направления</h2>
              {boxes.map((b) => (
                <Link key={b.id} href={`/cash/${b.id}`} className="row-between tree-row plain">
                  <span>
                    <span className="dot" style={{ background: b.color }} />
                    {b.name}
                  </span>
                  <strong>{formatMoney(bal.get(b.id) ?? 0)} ›</strong>
                </Link>
              ))}
              {boxes.length === 0 && (
                <form action={createCenterCashboxAction} className="form">
                  <p className="muted small" style={{ margin: 0 }}>
                    Если на это направление есть отдельные наличные — заведите кассу: будет виден остаток, а расходы из неё сразу попадут сюда.
                  </p>
                  <input type="hidden" name="centerId" value={id} />
                  <input type="hidden" name="name" value={center.name} />
                  <label>
                    Сейчас наличных, ₴
                    <input name="opening" inputMode="decimal" placeholder="0" />
                  </label>
                  <button className="btn btn-sm">Завести кассу</button>
                </form>
              )}
            </section>
          );
        })()}
      <section className="card">
        <h2>{children.length ? "Внутри" : "Разбить подробнее"}</h2>
        {children.length === 0 && (
          <p className="muted small">Можно разбить подробнее, например «Продукты» и «Топливо», — будет виден прогноз по каждому.</p>
        )}
        <ul className="bars">
          {children.map((c) => (
            <li key={c.id}>
              <BudgetLine s={c} total={s.spent} href={`/centers/${c.id}`} />
            </li>
          ))}
        </ul>
        <form action={addCenter} className="form" style={{ marginTop: 10 }}>
          <input type="hidden" name="parentId" value={id} />
          <input type="hidden" name="color" value={center.color} />
          <input type="hidden" name="next" value={`/centers/${id}`} />
          <label>
            Добавить внутрь
            <span className="input-row">
              <input name="name" required placeholder="например, Продукты" />
              <button className="btn btn-sm">Добавить</button>
            </span>
          </label>
        </form>
      </section>

      <details className="card settings-fold">
        <summary>Настройки направления</summary>
      <form action={updateCenterAction} className="form" style={{ marginTop: 14 }}>
        <input type="hidden" name="id" value={id} />
        <label>
          Название
          <input name="name" defaultValue={center.name} required maxLength={60} />
        </label>
        <label>
          Входит в
          <select name="parentId" defaultValue={center.parent_id ?? ""}>
            <option value="">Самостоятельное</option>
            {centerTree()
              .filter((c) => c.id !== id && !c.path.split(" › ").includes(center.name))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.path}
                </option>
              ))}
          </select>
        </label>
        <label>
          Цвет
          <input name="color" type="color" defaultValue={center.color} />
        </label>
        <label className="check">
          <input type="checkbox" name="personal" defaultChecked={Boolean((center as { is_personal?: number }).is_personal)} /> Мои личные деньги (входят в «Мои деньги за
          месяц»)
        </label>
        <label className="check">
          <input type="checkbox" name="internal" defaultChecked={Boolean(center.is_internal)} /> Только для переводов между своими картами (не расход)
        </label>
        <button className="btn btn-primary">Сохранить</button>
      </form>
      <form action={removeCenter} style={{ marginTop: 8 }}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="next" value="/centers" />
        <button className="btn btn-ghost btn-sm danger">Скрыть направление</button>
      </form>
      </details>

      <section className="card span-all">
        <h2>Операции за {month}</h2>
        {txs.length === 0 && <p className="muted small">В этом месяце операций нет.</p>}
        {txs.map((t) => (
          <Link key={t.id} href={`/inbox/${t.id}`} className="plain">
            <TxRow tx={t} />
          </Link>
        ))}
      </section>
    </div>
  );
}
