import Link from "next/link";
import { assignTransaction } from "../actions.ts";
import { TxRow } from "./TxRow.tsx";
import { suggestCenters, type Tx } from "@/lib/repo.ts";

type Center = { id: number; name: string; path: string; color: string; parent_id?: number | null; is_internal?: number };

/** Операция без направления: кнопки направлений — одно нажатие, и записано. */
export function UnassignedItem({ tx, centers, next }: { tx: Tx; centers: Map<number, Center>; next?: string }) {
  const sugg = suggestCenters(tx)
    .map((id) => centers.get(id))
    .filter((c): c is Center => Boolean(c));
  const roots = [...centers.values()].filter((c) => !c.parent_id && !c.is_internal && !sugg.some((s) => s.id === c.id));
  const buttons = [...sugg, ...roots].slice(0, 8);
  return (
    <div className="card card-unassigned">
      <TxRow tx={tx} hidePending />
      <div className="quick-chips">
        {/* У каждой кнопки своя форма: значение нажатой кнопки в общей форме до сервера не доходит. */}
        {buttons.map((c) => (
          <form key={c.id} action={assignTransaction}>
            <input type="hidden" name="id" value={tx.id} />
            <input type="hidden" name="centerId" value={c.id} />
            {next && <input type="hidden" name="next" value={next} />}
            <button className="quick-chip" title={c.path}>
              <i className="chip-dot" style={{ background: c.color }} />
              {c.name}
            </button>
          </form>
        ))}
        <Link href={`/inbox/${tx.id}`} className="quick-chip quick-more">
          Ещё…
        </Link>
      </div>
    </div>
  );
}
