import Link from "next/link";
import { UnassignedItem } from "../components/UnassignedItem.tsx";
import { acceptAllAction, undoAcceptAction } from "../actions.ts";
import { centerTree, getTx, listUnassigned } from "@/lib/repo.ts";
import { readyToAccept } from "@/lib/suggest.ts";
import { formatMoney } from "@/lib/money.ts";

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

export default async function Inbox({ searchParams }: { searchParams: Promise<{ done?: string; all?: string }> }) {
  const { done, all } = await searchParams;
  const items = listUnassigned();
  const centers = new Map(centerTree().map((c) => [c.id, c]));
  const total = items.reduce((a, t) => a + Math.abs(t.amount), 0);
  const ready = items.filter((t) => readyToAccept(t)).length;
  const doneTx = done ? getTx(Number(done)) : null;

  return (
    <div className="narrow-wide">
      <h1>Разбор операций</h1>

      {doneTx && (
        <form action={undoAcceptAction} className="toast-row">
          <input type="hidden" name="id" value={doneTx.id} />
          <span>
            ✓ Записано: <b>{doneTx.counterparty || "операция"}</b> · {formatMoney(Math.abs(doneTx.amount))}
          </span>
          <button className="toast-undo">Отменить</button>
        </form>
      )}
      {all && <div className="toast-row">✓ Записано сразу: {all}</div>}

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">✅</div>
          <strong>Всё записано</strong>
          <p>Новые оплаты появятся здесь. Чаще всего хватит одного нажатия «✓ Верно».</p>
          <Link href="/" className="btn btn-sm">
            На главную
          </Link>
        </div>
      ) : (
        <>
          <div className="review-head">
            <div>
              <b>
                {items.length} {plural(items.length, "операция", "операции", "операций")}
              </b>{" "}
              <span className="muted">на {formatMoney(total)}</span>
            </div>
            {ready > 1 && (
              <form action={acceptAllAction}>
                <button className="btn btn-primary btn-sm">✓ Подтвердить все подсказки ({ready})</button>
              </form>
            )}
          </div>
          <p className="page-hint" style={{ marginTop: 4 }}>
            D&amp;N уже подобрал, куда записать: как в прошлый раз или по подсказке ИИ. Верно — нажмите «✓ Верно». Нет — «Изменить».
          </p>
          {items.map((t) => (
            <UnassignedItem key={t.id} tx={t} centers={centers} />
          ))}
        </>
      )}
    </div>
  );
}
