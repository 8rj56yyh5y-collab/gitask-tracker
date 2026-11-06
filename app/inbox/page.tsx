import Link from "next/link";
import { assignTransaction } from "../actions.ts";
import { TxRow } from "../components/TxRow.tsx";
import { centerTree, listUnassigned, suggestCenters } from "@/lib/repo.ts";
import { formatMoney } from "@/lib/money.ts";

export default function Inbox() {
  const items = listUnassigned();
  const tree = centerTree();
  const byId = new Map(tree.map((c) => [c.id, c]));
  const total = items.reduce((a, t) => a + Math.abs(t.amount), 0);

  return (
    <div className="grid grid-auto">
      <h1>Не разнесено</h1>
      {items.length === 0 ? (
        <div className="card alert alert-ok big">Всё разнесено ✓</div>
      ) : (
        <p className="muted">
          {items.length} операций на {formatMoney(total)}. Выберите, куда ушли деньги.
        </p>
      )}
      {items.map((t) => {
        const sugg = suggestCenters(t).map((id) => byId.get(id)).filter(Boolean);
        return (
          <div key={t.id} className="card">
            <TxRow tx={t} />
            <form action={assignTransaction} className="quick">
              <input type="hidden" name="id" value={t.id} />
              {sugg.map((c) => (
                <button key={c!.id} name="centerId" value={c!.id} className="btn btn-sm" style={{ borderColor: c!.color }} title={c!.path}>
                  {c!.name}
                </button>
              ))}
              <Link href={`/inbox/${t.id}`} className="btn btn-sm btn-ghost">
                Подробнее…
              </Link>
            </form>
          </div>
        );
      })}
    </div>
  );
}
