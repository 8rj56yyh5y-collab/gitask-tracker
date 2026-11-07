import Link from "next/link";
import { TxRow } from "./TxRow.tsx";
import { suggestCenters, type Tx } from "@/lib/repo.ts";

type Center = { id: number; name: string; path: string; color: string; parent_id?: number | null; is_internal?: number };

/** Операция без направления: кнопки направлений — одно нажатие, и записано. */
export function UnassignedItem({ tx, centers }: { tx: Tx; centers: Map<number, Center>; next?: string }) {
  const sugg = suggestCenters(tx)
    .map((id) => centers.get(id))
    .filter((c): c is Center => Boolean(c));
  const roots = [...centers.values()].filter((c) => !c.parent_id && !c.is_internal && !sugg.some((s) => s.id === c.id));
  const buttons = [...sugg, ...roots].slice(0, 8);
  return (
    <div className="card card-unassigned">
      <TxRow tx={tx} hidePending />
      {tx.needs_note ? <div className="need-note">✍️ Нужен комментарий — на что именно</div> : null}
      <div className="quick-chips">
        {/* Нажатие открывает операцию с выбранным направлением: остаётся выбрать категорию и написать комментарий. */}
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
    </div>
  );
}
