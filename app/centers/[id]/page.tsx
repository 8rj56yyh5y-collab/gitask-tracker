import Link from "next/link";
import { notFound } from "next/navigation";
import { addCenter, updateCenterBudget } from "../../actions.ts";
import { BudgetLine } from "../../components/BudgetLine.tsx";
import { TxRow } from "../../components/TxRow.tsx";
import { centerStats, centerTransactions, childStats, getCenter } from "@/lib/repo.ts";
import { formatMoney } from "@/lib/money.ts";
import { dailyAllowance } from "@/lib/budget.ts";

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
          <Link href="/centers">Категории</Link>
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
        <h2>Расход за {month}</h2>
        <div className="big">{formatMoney(s.spent)}</div>
        <BudgetLine s={{ ...s, name: s.budget > 0 ? "Лимит на месяц" : "Без лимита" }} total={s.spent} />
        {daily !== null && (
          <p className="small">
            Чтобы уложиться в лимит, тратьте не больше <strong>{formatMoney(daily)} в день</strong> до конца месяца.
          </p>
        )}
        <form action={updateCenterBudget} className="inline">
          <input type="hidden" name="id" value={id} />
          <input
            name="budget"
            inputMode="decimal"
            placeholder="Лимит на месяц, ₴ (0 — без лимита)"
            defaultValue={center.monthly_budget ? center.monthly_budget / 100 : ""}
          />
          <button className="btn btn-sm">Сохранить лимит</button>
        </form>
      </section>

      <section className="card">
        <h2>Внутри: {children.length ? "категории" : "пока ничего"}</h2>
        {children.length === 0 && (
          <p className="muted small">Добавьте категории, например «Продукты» или «Топливо», чтобы видеть прогноз по каждой.</p>
        )}
        <ul className="bars">
          {children.map((c) => (
            <li key={c.id}>
              <BudgetLine s={c} total={s.spent} href={`/centers/${c.id}`} />
            </li>
          ))}
        </ul>
        <form action={addCenter} className="inline add-child">
          <input type="hidden" name="parentId" value={id} />
          <input type="hidden" name="color" value={center.color} />
          <input type="hidden" name="next" value={`/centers/${id}`} />
          <input name="name" required placeholder="Новая категория" />
          <input name="budget" inputMode="decimal" placeholder="Лимит, ₴" className="input-short" />
          <button className="btn btn-sm">Добавить</button>
        </form>
      </section>

      <section className="card span-all">
        <h2>Операции за {month}</h2>
        {txs.length === 0 && <p className="muted small">Операций пока нет.</p>}
        {txs.map((t) => (
          <Link key={t.id} href={`/inbox/${t.id}`} className="plain">
            <TxRow tx={t} />
          </Link>
        ))}
      </section>
    </div>
  );
}
