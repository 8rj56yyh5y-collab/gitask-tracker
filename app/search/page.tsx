import Link from "next/link";
import { searchTx } from "@/lib/repo.ts";
import { findSections, SECTIONS } from "@/lib/sections.ts";
import { listCards } from "@/lib/repo.ts";
import { listCashboxes } from "@/lib/cash.ts";
import { listPlans } from "@/lib/plans.ts";
import { formatMoney } from "@/lib/money.ts";
import { Icon } from "../components/Icon.tsx";
import { TxRow } from "../components/TxRow.tsx";
import { SearchBox } from "./SearchBox.tsx";

const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е");

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const words = norm(q).split(/\s+/).filter(Boolean);
  const has = (s: string) => words.length > 0 && words.every((w) => norm(s).includes(w));
  const sections = findSections(q);
  const cards = listCards().filter((c) => has(`${c.bank} ${c.last4} карта`));
  const boxes = listCashboxes().filter((b) => has(`${b.name} касса наличные`));
  const plans = [...listPlans("open", 200, "out"), ...listPlans("open", 200, "in")].filter((p) => has(p.title));
  const txs = q ? searchTx(q, 40) : [];
  const nothing = q && !sections.length && !cards.length && !boxes.length && !plans.length && !txs.length;

  return (
    <div className="narrow-wide">
      <h1>Поиск</h1>
      <SearchBox initial={q} />

      {!q && (
        <>
          <p className="muted small search-tip">Ищет всё сразу: операции (по магазину, комментарию, категории, сумме), карты, кассы, платежи и разделы.</p>
          <div className="search-group">Все разделы</div>
          <div className="card menu-list">
            {SECTIONS.map((s) => (
              <Link key={s.href} href={s.href} className="menu-row">
                <span className="menu-icon">
                  <Icon name={s.icon} />
                </span>
                <span className="menu-text">
                  <strong>{s.title}</strong>
                  <span className="muted small">{s.note}</span>
                </span>
                <Icon name="chevron" size={18} />
              </Link>
            ))}
          </div>
        </>
      )}

      {nothing && (
        <div className="card empty">
          <div className="empty-icon">🔍</div>
          <strong>По запросу «{q}» ничего нет</strong>
          <p className="muted small">Попробуйте короче: часть названия магазина, категорию или сумму.</p>
        </div>
      )}

      {sections.length > 0 && (
        <>
          <div className="search-group">Разделы</div>
          <div className="card menu-list">
            {sections.map((s) => (
              <Link key={s.href} href={s.href} className="menu-row">
                <span className="menu-icon">
                  <Icon name={s.icon} />
                </span>
                <span className="menu-text">
                  <strong>{s.title}</strong>
                  <span className="muted small">{s.note}</span>
                </span>
                <Icon name="chevron" size={18} />
              </Link>
            ))}
          </div>
        </>
      )}

      {(cards.length > 0 || boxes.length > 0) && (
        <>
          <div className="search-group">Карты и кассы</div>
          <div className="card menu-list">
            {cards.map((c) => (
              <Link key={`c${c.id}`} href={`/cards/${c.id}`} className="menu-row">
                <span className="menu-icon">
                  <Icon name="card" />
                </span>
                <span className="menu-text">
                  <strong>
                    {c.bank} •{c.last4}
                  </strong>
                  <span className="muted small">карта</span>
                </span>
                <Icon name="chevron" size={18} />
              </Link>
            ))}
            {boxes.map((b) => (
              <Link key={`b${b.id}`} href={`/cash/${b.id}`} className="menu-row">
                <span className="menu-icon">
                  <Icon name="wallet" />
                </span>
                <span className="menu-text">
                  <strong>{b.name}</strong>
                  <span className="muted small">касса с наличными</span>
                </span>
                <Icon name="chevron" size={18} />
              </Link>
            ))}
          </div>
        </>
      )}

      {plans.length > 0 && (
        <>
          <div className="search-group">Платежи</div>
          <div className="card menu-list">
            {plans.map((p) => (
              <Link key={p.id} href={`/plans/${p.id}`} className="menu-row">
                <span className="menu-icon">
                  <Icon name="calendar" />
                </span>
                <span className="menu-text">
                  <strong>{p.title}</strong>
                  <span className="muted small">{p.due_date ? `до ${p.due_date.split("-").reverse().join(".")}` : "без даты"}</span>
                </span>
                <b>{formatMoney(p.total - p.paid)}</b>
              </Link>
            ))}
          </div>
        </>
      )}

      {txs.length > 0 && (
        <>
          <div className="search-group">
            Операции · {txs.length}
            {txs.length >= 40 ? "+" : ""} на {formatMoney(Math.abs(txs.reduce((a, t) => a + t.amount, 0)))}
          </div>
          <div className="card">
            {txs.map((t) => (
              <Link key={t.id} href={`/inbox/${t.id}`} className="plain">
                <TxRow tx={t} />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
