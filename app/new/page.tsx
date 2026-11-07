import Link from "next/link";
import { addTransaction } from "../actions.ts";
import { AccountSelect } from "../components/AccountSelect.tsx";
import { centerTree } from "@/lib/repo.ts";

export default function NewTx() {
  const tree = centerTree();
  return (
    <div className="narrow">
      <h1>Новая операция</h1>
      <div className="inline" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <Link href="/income" className="btn btn-sm">Доход ›</Link>
        <Link href="/plans#new" className="btn btn-sm">Запланировать платёж ›</Link>
        <Link href="/sales/new" className="btn btn-sm">Продажа товара ›</Link>
        <Link href="/transit" className="btn btn-sm">Чужие деньги ›</Link>
        <Link href="/centers" className="btn btn-sm">Касса ›</Link>
      </div>
      <form action={addTransaction} className="card form">
        <div className="seg">
          <label>
            <input type="radio" name="direction" value="out" defaultChecked /> Расход
          </label>
          <label>
            <input type="radio" name="direction" value="in" /> Доход
          </label>
        </div>
        <label>
          Сумма, ₴
          <input name="amount" inputMode="decimal" required autoFocus placeholder="0" className="amount-input" />
        </label>
        <label>
          Направление
          <select name="centerId" required defaultValue="">
            <option value="" disabled>
              — выберите —
            </option>
            {tree.map((c) => (
              <option key={c.id} value={c.id}>
                {" ".repeat(c.depth * 3)}
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Карта или касса
          <AccountSelect none="не указано" />
        </label>
        <label>
          Где или кому
          <input name="counterparty" placeholder="например, магазин" />
        </label>
        <label>
          Для кого
          <input name="forWhom" placeholder="для себя, для семьи…" />
        </label>
        <label>
          Комментарий
          <input name="description" />
        </label>
        <label>
          Дата и время
          <input name="date" type="datetime-local" />
        </label>
        <button className="btn btn-primary">Записать</button>
      </form>
    </div>
  );
}
