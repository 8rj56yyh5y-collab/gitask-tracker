import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteCardAction, removeCard, setCardParentAction, updateCardAction } from "../../actions.ts";
import { CardTile } from "../../components/CardTile.tsx";
import { TxRow } from "../../components/TxRow.tsx";
import { BANK_NAMES, BANK_STYLE, cardStyle } from "@/lib/banks.ts";
import { forecastExhaustDay } from "@/lib/limits.ts";
import { formatMoney } from "@/lib/money.ts";
import { cardTransactions, cardUsage, childCards, getCard, groupUsage, listMainCards } from "@/lib/repo.ts";
import { BankBadge } from "../../components/BankBadge.tsx";

const KINDS: Record<string, string> = { personal: "Личная", fop: "ФОП", corporate: "Корпоративная", cash: "Касса (наличные)" };

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const card = getCard(Number(raw));
  if (!card || card.archived) notFound();
  const own = cardUsage();
  const used = groupUsage().get(card.id) ?? 0;
  const kids = childCards(card.id);
  const parent = card.parent_id ? getCard(card.parent_id) : null;
  const mains = listMainCards().filter((c) => c.id !== card.id && c.bank === card.bank);
  const st = cardStyle(card);
  const day = forecastExhaustDay(used, card.monthly_limit, new Date());
  const txs = cardTransactions(card.id);
  const month = new Date().toLocaleDateString("ru-RU", { month: "long" });

  return (
    <div className="narrow-wide">
      <div className="muted small">
        <Link href="/cards">Карты</Link>
      </div>
      <h1>
        {card.bank} •••• {card.last4}
      </h1>
      {parent && (
        <p className="small">
          Эта карта входит в основную{" "}
          <Link href={`/cards/${parent.id}`} className="link">
            {parent.bank} •••• {parent.last4}
          </Link>
          : у них общий лимит.
        </p>
      )}
      <div className="card-hero">
        <CardTile card={card} used={parent ? (own.get(card.id) ?? 0) : used} extra={kids.length} />
      </div>
      {kids.length > 0 && (
        <section className="card" style={{ marginTop: 12 }}>
          <h2>Карты внутри · траты за месяц</h2>
          <div className="subcard">
            <BankBadge bank={card.bank} color={card.color} badge={card.badge} size={32} />
            <span className="grow">
              •••• {card.last4} <span className="muted small">основная</span>
            </span>
            <strong>{formatMoney(own.get(card.id) ?? 0)}</strong>
          </div>
          {kids.map((k) => (
            <div key={k.id} className="subcard">
              <BankBadge bank={k.bank} color={k.color} badge={k.badge} size={32} />
              <Link href={`/cards/${k.id}`} className="grow plain">
                •••• {k.last4} {k.owner && <span className="muted small">· {k.owner}</span>}
              </Link>
              <strong>{formatMoney(own.get(k.id) ?? 0)}</strong>
              <form action={setCardParentAction}>
                <input type="hidden" name="id" value={k.id} />
                <input type="hidden" name="next" value={`/cards/${card.id}`} />
                <button className="btn btn-ghost btn-sm" title="Сделать отдельной картой со своим лимитом">
                  Отделить
                </button>
              </form>
            </div>
          ))}
        </section>
      )}
      {day && <p className="warn small">При текущем темпе лимит закончится {day}-го числа.</p>}

      <section className="card" style={{ marginTop: 12 }}>
        <h2>Операции за {month}</h2>
        {txs.length === 0 && <p className="muted small">Операций по этой карте в этом месяце нет.</p>}
        {txs.map((t) => (
          <Link key={t.id} href={`/inbox/${t.id}`} className="plain">
            <TxRow tx={t} />
          </Link>
        ))}
      </section>

      <form action={updateCardAction} className="card form">
        <h2>Настройки карты</h2>
        <input type="hidden" name="id" value={card.id} />
        <input type="hidden" name="next" value={`/cards/${card.id}`} />
        <label>
          Банк
          <select name="bank" defaultValue={card.bank}>
            {BANK_NAMES.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label>
          Последние 4 цифры
          <input name="last4" inputMode="numeric" maxLength={4} required defaultValue={card.last4} />
        </label>
        <label>
          Чья карта
          <input name="owner" defaultValue={card.owner} />
        </label>
        <label>
          Тип
          <select name="kind" defaultValue={card.kind}>
            {Object.entries(KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Лимит в месяц, ₴ (0 — без лимита)
          <input name="limit" inputMode="decimal" defaultValue={card.monthly_limit ? card.monthly_limit / 100 : ""} />
        </label>
        <label>
          Цвет карты
          <span className="color-row">
            <input name="color" type="color" defaultValue={st.color} aria-label="Цвет карты" />
            <span className="muted small">цвет банка: {(BANK_STYLE[card.bank] ?? BANK_STYLE["Другой"]).color}</span>
          </span>
        </label>
        <label>
          Значок (до 4 символов)
          <input name="badge" maxLength={4} defaultValue={st.badge} placeholder="например, mono, П, NP" />
        </label>
        <label className="check">
          <input type="checkbox" name="resetStyle" /> Вернуть цвет и значок банка
        </label>
        <button className="btn btn-primary">Сохранить</button>
      </form>

      {(parent || mains.length > 0) && (
        <form action={setCardParentAction} className="card form">
          <h2>Входит в другую карту</h2>
          <input type="hidden" name="id" value={card.id} />
          <input type="hidden" name="next" value={`/cards/${card.id}`} />
          <select name="parentId" defaultValue={card.parent_id ?? ""}>
            <option value="">нет — отдельная карта со своим лимитом</option>
            {mains.map((c) => (
              <option key={c.id} value={c.id}>
                {c.bank} •••• {c.last4}
              </option>
            ))}
          </select>
          <button className="btn btn-sm">Сохранить</button>
        </form>
      )}

      <details className="card settings-fold danger-fold">
        <summary>Убрать карту</summary>
        <p className="small">
          <b>Скрыть</b> — карта пропадёт из списков, но её можно будет вернуть. <b>Удалить</b> — карта удаляется совсем; её операции
          останутся в истории, но без привязки к карте.
        </p>
        <div className="row-gap">
          <form action={removeCard}>
            <input type="hidden" name="id" value={card.id} />
            <input type="hidden" name="next" value="/cards" />
            <button className="btn btn-sm">Скрыть карту</button>
          </form>
          <form action={deleteCardAction}>
            <input type="hidden" name="id" value={card.id} />
            <button className="btn btn-sm danger-btn">Удалить карту навсегда</button>
          </form>
        </div>
      </details>
      <p className="muted small">Списано за месяц: {formatMoney(used)}.</p>
    </div>
  );
}
