import Link from "next/link";
import { acceptOneAction } from "../actions.ts";
import { TxRow } from "./TxRow.tsx";
import { listCards, needsCard, suggestCenters, type Tx } from "@/lib/repo.ts";
import { fullSuggestion } from "@/lib/suggest.ts";
import { getCategory, label, listCategories, suggestedCategories } from "@/lib/categories.ts";
import { isSimple } from "@/lib/mode.ts";

type Center = { id: number; name: string; path: string; color: string; parent_id?: number | null; is_internal?: number };

/**
 * Операция, которую нужно записать.
 * Есть подсказка (как в прошлый раз или от ИИ) — одна большая кнопка «✓ Верно».
 * Нет — кнопки направлений, нажатие открывает операцию с уже выбранным направлением.
 */
export function UnassignedItem({ tx, centers, next = "/inbox" }: { tx: Tx; centers: Map<number, Center>; next?: string }) {
  const full = fullSuggestion(tx);
  // Карта неизвестна и угадать её не из чего — сначала откройте операцию и выберите карту.
  const s = full && (!needsCard(tx) || full.cardId) ? full : null;
  const card = s?.cardId ? listCards().find((c) => c.id === s.cardId) : undefined;
  const center = s ? centers.get(s.centerId) : undefined;
  const cat = s ? getCategory(s.categoryId) : null;
  const sugg = suggestCenters(tx)
    .map((id) => centers.get(id))
    .filter((c): c is Center => Boolean(c));
  const roots = [...centers.values()].filter((c) => !c.parent_id && !c.is_internal && !sugg.some((x) => x.id === c.id));
  const buttons = [...sugg, ...roots].slice(0, 8);
  const all = listCategories();
  const simpleCats = isSimple() && tx.amount < 0 ? suggestedCategories(tx, 5).map((id) => all.find((c) => c.id === id)).filter((c) => c !== undefined) : null;

  return (
    <div className="card review-item">
      <TxRow tx={tx} hidePending />
      {needsCard(tx) && !s && <div className="need-note">💳 Укажите, с какой карты — откройте операцию</div>}
      {s && center ? (
        <div className="review-sugg">
          <div className="review-sugg-text">
            <span className="review-sugg-src">{s.source === "history" ? "Как в прошлый раз" : "✨ Подсказка ИИ"}</span>
            <span className="review-sugg-what">
              {cat ? `${label(cat)} · ` : ""}
              {center.name}
              {s.note && <span className="muted"> · «{s.note}»</span>}
              {card && <span className="muted"> · 💳 {card.bank} •{card.last4}</span>}
            </span>
          </div>
          <div className="review-actions">
            <form action={acceptOneAction}>
              <input type="hidden" name="id" value={tx.id} />
              <input type="hidden" name="next" value={next} />
              <button className="btn btn-primary review-yes">{s.note ? "✓ Верно" : "✓ Верно, дальше комментарий"}</button>
            </form>
            <Link href={`/inbox/${tx.id}`} className="btn review-edit">
              Изменить
            </Link>
          </div>
        </div>
      ) : (
        simpleCats ? (
        <div className="quick-chips">
          {/* Простой режим: сразу «на что», нажатие открывает операцию с выбранной категорией. */}
          {simpleCats.map((c) => (
            <Link key={c.id} href={`/inbox/${tx.id}?cat=${c.id}`} className="quick-chip">
              {c.emoji} {c.name}
            </Link>
          ))}
          <Link href={`/inbox/${tx.id}`} className="quick-chip quick-more">
            Другое…
          </Link>
        </div>
        ) : (
        <div className="quick-chips">
          {/* Нажатие открывает операцию с выбранным направлением: остаётся категория и комментарий. */}
          {buttons.map((c) => (
            <Link key={c.id} href={`/inbox/${tx.id}?c=${c.id}`} className="quick-chip" title={c.path}>
              <i className="chip-dot" style={{ background: c.color }} />
              {c.name}
            </Link>
          ))}
          <Link href={`/inbox/${tx.id}`} className="quick-chip quick-more">
            Ещё…
          </Link>
        </div>
        )
      )}
    </div>
  );
}
