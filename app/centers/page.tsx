import Link from "next/link";
import { addCenter, removeCenter, restoreCenterAction } from "../actions.ts";
import { Hint } from "../components/Hint.tsx";
import { centerStats, centerTree, listHiddenCenters } from "@/lib/repo.ts";
import { cashBalances, listCashboxes } from "@/lib/cash.ts";
import { formatMoney } from "@/lib/money.ts";

export default function Directions() {
  const tree = centerTree();
  const stats = centerStats();
  const boxes = listCashboxes();
  const bal = cashBalances();
  const boxesOf = (id: number) => boxes.filter((b) => b.center_id === id);
  const loose = boxes.filter((b) => !b.center_id || !tree.some((c) => c.id === b.center_id));
  const month = new Date().toLocaleDateString("ru-RU", { month: "long" });

  return (
    <div className="narrow-wide">
      <h1>Направления</h1>
      <Hint>
        На что уходят деньги: личное, работа, семья. У направления может быть лимит на месяц и своя касса с наличными — её остаток виден
        здесь же.
      </Hint>
      <div className="card">
        {tree.map((c) => {
          const s = stats.get(c.id);
          const own = boxesOf(c.id);
          return (
            <div key={c.id} className="row-between tree-row dir-row" style={{ paddingLeft: c.depth * 18 }}>
              <Link href={`/centers/${c.id}`} className="plain dir-main">
                <span>
                  <i className="dot" style={{ background: c.color }} />
                  <strong style={{ fontWeight: c.depth ? 500 : 650 }}>{c.name}</strong>
                </span>
                <span className="muted small dir-sub">
                  {c.is_internal
                    ? "не доход и не расход"
                    : `${month}: ${formatMoney(s?.spent ?? 0)}${c.monthly_budget > 0 ? ` из ${formatMoney(c.monthly_budget)}` : ""}`}
                  {own.map((b) => ` · касса ${formatMoney(bal.get(b.id) ?? 0)}`).join("")}
                </span>
              </Link>
              <form action={removeCenter}>
                <input type="hidden" name="id" value={c.id} />
                <button className="btn btn-ghost btn-sm" title="Скрыть" aria-label={`Скрыть «${c.name}»`}>
                  ✕
                </button>
              </form>
            </div>
          );
        })}
      </div>

      {loose.length > 0 && (
        <section className="card">
          <h2>Общие кассы</h2>
          <p className="muted small" style={{ marginTop: 0 }}>Наличные, которые не относятся к одному направлению. Привязать можно в настройках кассы.</p>
          {loose.map((b) => (
            <Link key={b.id} href={`/cash/${b.id}`} className="row-between tree-row plain">
              <span>
                <i className="dot" style={{ background: b.color }} />
                {b.name}
              </span>
              <strong>{formatMoney(bal.get(b.id) ?? 0)} ›</strong>
            </Link>
          ))}
        </section>
      )}

      <form action={addCenter} className="card form">
        <h2>Новое направление</h2>
        <input type="hidden" name="next" value="/centers" />
        <label>
          Название
          <input name="name" required placeholder="например, Продукты" />
        </label>
        <div className="grid-2-tight">
          <label>
            Входит в
            <select name="parentId">
              <option value="">— самостоятельное —</option>
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
        </div>
        <label>
          Лимит в месяц, ₴ (необязательно)
          <input name="budget" inputMode="decimal" />
        </label>
        <label className="check">
          <input type="checkbox" name="withCash" /> Своя касса с наличными
        </label>
        <label>
          Сейчас наличных в этой кассе, ₴
          <input name="opening" inputMode="decimal" placeholder="0" />
        </label>
        <label className="check">
          <input type="checkbox" name="internal" /> Это переводы между своими счетами (не доход и не расход)
        </label>
        <button className="btn btn-primary">Добавить</button>
      </form>

      <p className="muted small">
        <Link href="/cash" className="link">Все кассы и переводы между ними ›</Link>
      </p>

      {listHiddenCenters().length > 0 && (
        <section className="card">
          <h2>Скрытые направления</h2>
          {listHiddenCenters().map((c) => (
            <form key={c.id} action={restoreCenterAction} className="row-between tree-row">
              <input type="hidden" name="id" value={c.id} />
              <span>
                <i className="dot" style={{ background: c.color }} />
                {c.name}
              </span>
              <button className="btn btn-sm">Вернуть</button>
            </form>
          ))}
        </section>
      )}
    </div>
  );
}
