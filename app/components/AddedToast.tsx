import { undoAddedAction } from "../actions.ts";
import { getTx } from "@/lib/repo.ts";
import { formatMoney } from "@/lib/money.ts";

/** «✓ Записано: Кофе · 75 ₴ — Отменить» после быстрой записи. */
export function AddedToast({ id, next }: { id?: string; next: string }) {
  const tx = id ? getTx(Number(id)) : null;
  if (!tx) return null;
  return (
    <form action={undoAddedAction} className="toast-row toast-pop">
      <input type="hidden" name="id" value={tx.id} />
      <input type="hidden" name="next" value={next} />
      <span>
        ✓ Записано: <b>{tx.category_emoji ? `${tx.category_emoji} ` : ""}{tx.description || tx.counterparty}</b> · {formatMoney(Math.abs(tx.amount))}
      </span>
      <button className="toast-undo">Отменить</button>
    </form>
  );
}
