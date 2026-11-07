import { addCard, removeCard, setCardLimit } from "../actions.ts";
import { LimitBar } from "../components/LimitBar.tsx";
import { cardUsage, listCards } from "@/lib/repo.ts";
import { formatMoney } from "@/lib/money.ts";
import { forecastExhaustDay, limitState } from "@/lib/limits.ts";
import { BANK_NAMES } from "@/lib/banks.ts";

const BANKS = BANK_NAMES;
const KINDS: Record<string, string> = { personal: "Личная", fop: "ФОП", corporate: "Корпоративная", cash: "Касса (наличные)" };

export default function Cards() {
  const cards = listCards();
  const usage = cardUsage();
  const limited = cards.filter((c) => c.monthly_limit > 0);
  const totalLimit = limited.reduce((a, c) => a + c.monthly_limit, 0);
  const totalUsed = limited.reduce((a, c) => a + (usage.get(c.id) ?? 0), 0);
  const today = new Date();
  // Подсказка: карта с наибольшим остатком лимита.
  const best = limited
    .map((c) => ({ c, left: c.monthly_limit - (usage.get(c.id) ?? 0) }))
    .sort((a, b) => b.left - a.left)[0];

  return (
    <div className="grid grid-auto">
      <h1>Лимиты карт</h1>
      {limited.length > 0 && (
        <div className="card">
          <h2>Итого по всем картам</h2>
          <LimitBar used={totalUsed} limit={totalLimit} />
          {best && best.left > 0 && (
            <p className="small">
              Платить лучше с <strong>{best.c.bank} *{best.c.last4}</strong> — там осталось {formatMoney(best.left)}.
            </p>
          )}
        </div>
      )}

      {cards.map((c) => {
        const used = usage.get(c.id) ?? 0;
        const s = limitState(used, c.monthly_limit);
        const day = forecastExhaustDay(used, c.monthly_limit, today);
        return (
          <div key={c.id} className={`card card-${c.monthly_limit ? s.level : "none"}`}>
            <div className="row-between">
              <div>
                <strong>
                  {c.bank} *{c.last4}
                </strong>
                <div className="muted small">
                  {KINDS[c.kind] ?? c.kind}
                  {c.owner && <> · {c.owner}</>}
                </div>
              </div>
              <form action={removeCard}>
                <input type="hidden" name="id" value={c.id} />
                <button className="btn btn-ghost btn-sm" title="Скрыть карту">✕</button>
              </form>
            </div>
            <LimitBar used={used} limit={c.monthly_limit} />
            {day && <div className="small warn">При текущем темпе лимит закончится {day}-го числа.</div>}
            <form action={setCardLimit} className="inline">
              <input type="hidden" name="id" value={c.id} />
              <input name="limit" inputMode="decimal" placeholder="Лимит в месяц, ₴" defaultValue={c.monthly_limit ? c.monthly_limit / 100 : ""} />
              <button className="btn btn-sm">Сохранить</button>
            </form>
          </div>
        );
      })}

      <form action={addCard} className="card form">
        <h2>Добавить карту</h2>
        <label>
          Банк
          <select name="bank">
            {BANKS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label>
          Последние 4 цифры
          <input name="last4" inputMode="numeric" maxLength={4} required placeholder="1234" />
        </label>
        <label>
          Чья карта
          <input name="owner" placeholder="например, я / Иван" />
        </label>
        <label>
          Тип
          <select name="kind">
            {Object.entries(KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Лимит в месяц, ₴
          <input name="limit" inputMode="decimal" placeholder="30000" />
        </label>
        <label>
          ID счёта Monobank (необязательно)
          <input name="monoAccount" placeholder="для автоматического приёма операций" />
        </label>
        <button className="btn btn-primary">Добавить</button>
      </form>
    </div>
  );
}
