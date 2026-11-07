import { addCard, setDefaultLimitAction } from "../actions.ts";
import { CardTile } from "../components/CardTile.tsx";
import { LimitBar } from "../components/LimitBar.tsx";
import { cardUsage, defaultCardLimit, listCards } from "@/lib/repo.ts";
import { formatMoney } from "@/lib/money.ts";
import { BANK_NAMES } from "@/lib/banks.ts";

const KINDS: Record<string, string> = { personal: "Личная", fop: "ФОП", corporate: "Корпоративная", cash: "Касса (наличные)" };

export default function Cards() {
  const cards = listCards();
  const usage = cardUsage();
  const limited = cards.filter((c) => c.monthly_limit > 0);
  const totalLimit = limited.reduce((a, c) => a + c.monthly_limit, 0);
  const totalUsed = limited.reduce((a, c) => a + (usage.get(c.id) ?? 0), 0);
  const def = defaultCardLimit();
  // Подсказка: карта с наибольшим остатком лимита.
  const best = limited.map((c) => ({ c, left: c.monthly_limit - (usage.get(c.id) ?? 0) })).sort((a, b) => b.left - a.left)[0];
  const noLimit = cards.filter((c) => c.monthly_limit === 0).length;

  return (
    <>
      <h1>Карты</h1>
      {limited.length > 0 && (
        <div className="card">
          <h2>Лимиты всех карт за месяц</h2>
          <LimitBar used={totalUsed} limit={totalLimit} />
          {best && best.left > 0 && (
            <p className="small" style={{ marginBottom: 0 }}>
              Платить лучше с <strong>{best.c.bank} •••• {best.c.last4}</strong> — там осталось {formatMoney(best.left)}.
            </p>
          )}
        </div>
      )}

      {cards.length === 0 ? (
        <div className="card">
          <strong>Карт пока нет</strong>
          <p className="muted small">Добавьте карты ниже. Monobank добавляется сам — в «Настройках».</p>
        </div>
      ) : (
        <div className="ctiles">
          {cards.map((c) => (
            <CardTile key={c.id} card={c} used={usage.get(c.id) ?? 0} href={`/cards/${c.id}`} />
          ))}
        </div>
      )}
      <p className="muted small">Нажмите на карту, чтобы изменить лимит, цвет и значок или посмотреть её операции.</p>

      <form action={setDefaultLimitAction} className="card form">
        <h2>Лимит по умолчанию</h2>
        <p className="small" style={{ margin: 0 }}>
          Ставится каждой новой карте, в том числе из Monobank. У каждой карты его можно поменять.
        </p>
        <div className="inline">
          <input name="limit" inputMode="decimal" placeholder="например, 30000" defaultValue={def ? def / 100 : ""} aria-label="Лимит по умолчанию, ₴" />
          <button className="btn btn-sm">Сохранить</button>
        </div>
        {noLimit > 0 && (
          <label className="check">
            <input type="checkbox" name="applyAll" /> Поставить и картам без лимита ({noLimit})
          </label>
        )}
      </form>

      <form action={addCard} className="card form">
        <h2>Добавить карту</h2>
        <label>
          Банк
          <select name="bank">
            {BANK_NAMES.map((b) => (
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
          <input name="owner" placeholder="например, моя / Иван" />
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
          <input name="limit" inputMode="decimal" placeholder={def ? `по умолчанию ${def / 100}` : "30000"} />
        </label>
        <button className="btn btn-primary">Добавить</button>
      </form>
    </>
  );
}
