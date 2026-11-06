import Link from "next/link";
import { addCenter, removeCenter } from "../actions.ts";
import { centerTree } from "@/lib/repo.ts";
import { formatMoney } from "@/lib/money.ts";

export default function Centers() {
  const tree = centerTree();
  return (
    <div className="grid grid-2">
      <h1>Категории</h1>
      <div className="card">
        {tree.map((c) => (
          <div key={c.id} className="row-between tree-row" style={{ paddingLeft: c.depth * 20 }}>
            <Link href={`/centers/${c.id}`} className="plain">
              <i className="dot" style={{ background: c.color }} />
              {c.name}
              {c.is_internal ? <span className="muted small"> · не расход</span> : null}
              {c.monthly_budget > 0 && <span className="muted small"> · лимит {formatMoney(c.monthly_budget)}</span>}
            </Link>
            <form action={removeCenter}>
              <input type="hidden" name="id" value={c.id} />
              <button className="btn btn-ghost btn-sm" title="Скрыть">✕</button>
            </form>
          </div>
        ))}
      </div>
      <form action={addCenter} className="card form">
        <h2>Добавить категорию</h2>
        <label>
          Название
          <input name="name" required placeholder="например, Пункт в Житомире" />
        </label>
        <label>
          Входит в
          <select name="parentId">
            <option value="">— верхний уровень —</option>
            {tree.map((c) => (
              <option key={c.id} value={c.id}>
                {c.path}
              </option>
            ))}
          </select>
        </label>
        <label>
          Цвет
          <input name="color" type="color" defaultValue="#2563eb" />
        </label>
        <label>
          Лимит в месяц, ₴ (необязательно)
          <input name="budget" inputMode="decimal" />
        </label>
        <label className="check">
          <input type="checkbox" name="internal" /> Внутренние переводы (не считать расходом)
        </label>
        <button className="btn btn-primary">Добавить</button>
      </form>
      <form action="/logout" method="post" className="span-all">
        <button className="btn btn-ghost btn-sm">Выйти</button>
      </form>
    </div>
  );
}
