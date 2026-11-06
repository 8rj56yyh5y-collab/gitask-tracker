import Link from "next/link";
import { assignTransaction } from "../actions.ts";
import { TxRow } from "./TxRow.tsx";
import { suggestCenters, type Tx } from "@/lib/repo.ts";

type Center = { id: number; name: string; path: string; color: string };

/** Неразнесённая операция с кнопками быстрого выбора категории. */
export function UnassignedItem({ tx, centers, next }: { tx: Tx; centers: Map<number, Center>; next?: string }) {
  const sugg = suggestCenters(tx)
    .map((id) => centers.get(id))
    .filter((c): c is Center => Boolean(c));
  return (
    <div className="card card-unassigned">
      <TxRow tx={tx} />
      {/* У каждой кнопки своя форма: значение нажатой кнопки в общей форме до сервера не доходит. */}
      <div className="quick">
        {sugg.map((c) => (
          <form key={c.id} action={assignTransaction}>
            <input type="hidden" name="id" value={tx.id} />
            <input type="hidden" name="centerId" value={c.id} />
            {next && <input type="hidden" name="next" value={next} />}
            <button className="btn btn-sm" style={{ borderColor: c.color }} title={c.path}>
              {c.name}
            </button>
          </form>
        ))}
        <Link href={`/inbox/${tx.id}`} className="btn btn-sm btn-ghost">
          {sugg.length ? "Другое…" : "Выбрать категорию…"}
        </Link>
      </div>
    </div>
  );
}
