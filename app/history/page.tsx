import { Hint } from "../components/Hint.tsx";
import Link from "next/link";
import { TxRow } from "../components/TxRow.tsx";
import { UnassignedItem } from "../components/UnassignedItem.tsx";
import { centerTree, listRecent, listUnassigned } from "@/lib/repo.ts";
import { formatMoney } from "@/lib/money.ts";

export default function History() {
  // Неразнесённые висят сверху, пока им не выбрана категория, — с любой карты и из любого источника.
  const pending = listUnassigned();
  const pendingIds = new Set(pending.map((t) => t.id));
  const done = listRecent(200).filter((t) => !pendingIds.has(t.id));
  const centers = new Map(centerTree().map((c) => [c.id, c]));
  const pendingSum = pending.reduce((a, t) => a + Math.abs(t.amount), 0);

  return (
    <div className="narrow-wide">
      <h1>История</h1>
      <Hint>Все ваши операции, новые сверху. Нажмите на любую, чтобы поменять направление или удалить.</Hint>

      {pending.length > 0 && (
        <section className="pending-block">
          <h2 className="danger">
            Ждут направления · {formatMoney(pendingSum)}
          </h2>
          {pending.map((t) => (
            <UnassignedItem key={t.id} tx={t} centers={centers} />
          ))}
        </section>
      )}

      <h2>{pending.length > 0 ? "Записанные" : "Все операции"}</h2>
      {done.length === 0 && pending.length === 0 && (
        <div className="empty">
          <div className="empty-icon">🧾</div>
          <strong>Операций пока нет</strong>
          <p>Нажмите «＋» внизу, чтобы записать первую.</p>
        </div>
      )}
      {done.length > 0 && (
        <div className="card">
          {done.map((t) => (
            <Link key={t.id} href={`/inbox/${t.id}`} className="plain">
              <TxRow tx={t} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
