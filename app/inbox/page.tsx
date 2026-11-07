import { UnassignedItem } from "../components/UnassignedItem.tsx";
import { centerTree, listUnassigned } from "@/lib/repo.ts";
import { formatMoney } from "@/lib/money.ts";

export default function Inbox() {
  const items = listUnassigned();
  const centers = new Map(centerTree().map((c) => [c.id, c]));
  const total = items.reduce((a, t) => a + Math.abs(t.amount), 0);

  return (
    <div className="grid grid-auto">
      <h1>Не разнесено</h1>
      {items.length === 0 ? (
        <div className="card alert alert-ok big span-all">Всё разнесено ✓</div>
      ) : (
        <p className="muted">
          {items.length} операций на {formatMoney(total)}. Выберите, куда ушли деньги.
        </p>
      )}
      {items.map((t) => (
        <UnassignedItem key={t.id} tx={t} centers={centers} />
      ))}
    </div>
  );
}
