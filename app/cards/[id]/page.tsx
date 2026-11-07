import Link from "next/link";
import { notFound } from "next/navigation";
import { removeCard, updateCardAction } from "../../actions.ts";
import { CardTile } from "../../components/CardTile.tsx";
import { TxRow } from "../../components/TxRow.tsx";
import { BANK_NAMES, BANK_STYLE, cardStyle } from "@/lib/banks.ts";
import { forecastExhaustDay } from "@/lib/limits.ts";
import { formatMoney } from "@/lib/money.ts";
import { cardTransactions, cardUsage, getCard } from "@/lib/repo.ts";

const KINDS: Record<string, string> = { personal: "Личная", fop: "ФОП", corporate: "Корпоративная", cash: "Касса (наличные)" };

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const card = getCard(Number(raw));
  if (!card || card.archived) notFound();
  const used = cardUsage().get(card.id) ?? 0;
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
      <div className="card-hero">
        <CardTile card={card} used={used} />
      </div>
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

      <form action={removeCard}>
        <input type="hidden" name="id" value={card.id} />
        <input type="hidden" name="next" value="/cards" />
        <button className="btn btn-ghost btn-sm danger">Скрыть карту</button>
      </form>
      <p className="muted small">Списано за месяц: {formatMoney(used)}.</p>
    </div>
  );
}
