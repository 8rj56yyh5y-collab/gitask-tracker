import { addTransaction } from "../actions.ts";
import { centerTree, listCards } from "@/lib/repo.ts";

export default function NewTx() {
  const tree = centerTree();
  const cards = listCards();
  return (
    <div className="narrow">
      <h1>Новая операция</h1>
      <form action={addTransaction} className="card form">
        <div className="seg">
          <label>
            <input type="radio" name="direction" value="out" defaultChecked /> Расход
          </label>
          <label>
            <input type="radio" name="direction" value="in" /> Поступление
          </label>
        </div>
        <label>
          Сумма, ₴
          <input name="amount" inputMode="decimal" required autoFocus placeholder="0" className="amount-input" />
        </label>
        <label>
          Категория
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
          Карта / касса
          <select name="cardId" defaultValue="">
            <option value="">наличные / не указано</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.bank} *{c.last4}
              </option>
            ))}
          </select>
        </label>
        <label>
          Кому / где
          <input name="counterparty" placeholder="магазин или получатель" />
        </label>
        <label>
          Для кого
          <input name="forWhom" placeholder="для себя, для руководителя…" />
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
