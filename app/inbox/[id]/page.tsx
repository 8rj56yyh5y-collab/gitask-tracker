import { notFound } from "next/navigation";
import { assignTransaction, removeTransaction } from "../../actions.ts";
import { TxRow } from "../../components/TxRow.tsx";
import { centerTree, getTx, suggestCenters } from "@/lib/repo.ts";

// Экран «Куда ушли деньги?» — его открывает «Команда» iOS сразу после оплаты.
export default async function AssignOne({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tx = getTx(Number(id));
  if (!tx) notFound();
  const tree = centerTree();
  const sugg = new Set(suggestCenters(tx));

  return (
    <>
      <h1>Куда ушли деньги?</h1>
      <div className="card">
        <TxRow tx={tx} />
      </div>
      <form action={assignTransaction} className="card form">
        <input type="hidden" name="id" value={tx.id} />
        <input type="hidden" name="next" value="/inbox" />
        <div className="choices">
          {tree.map((c) => (
            <label key={c.id} className={`choice ${sugg.has(c.id) ? "choice-sugg" : ""}`} style={{ marginLeft: c.depth * 16 }}>
              <input type="radio" name="centerId" value={c.id} defaultChecked={tx.cost_center_id === c.id} required />
              <i className="dot" style={{ background: c.color }} />
              {c.name}
            </label>
          ))}
        </div>
        <label>
          Для кого / по чьей просьбе
          <input name="forWhom" defaultValue={tx.for_whom} placeholder="например, руководитель" />
        </label>
        <label>
          Комментарий
          <input name="description" defaultValue={tx.description} placeholder="за что" />
        </label>
        <button className="btn btn-primary">Записать</button>
      </form>
      <form action={removeTransaction}>
        <input type="hidden" name="id" value={tx.id} />
        <button className="btn btn-ghost btn-sm danger">Удалить операцию (дубль / ошибка)</button>
      </form>
    </>
  );
}
