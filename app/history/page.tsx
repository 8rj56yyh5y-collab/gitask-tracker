import Link from "next/link";
import { TxRow } from "../components/TxRow.tsx";
import { listRecent } from "@/lib/repo.ts";

export default function History() {
  const items = listRecent(200);
  return (
    <div className="narrow-wide">
      <h1>История</h1>
      {items.length === 0 && <p className="muted">Операций пока нет.</p>}
      <div className="card">
        {items.map((t) => (
          <Link key={t.id} href={`/inbox/${t.id}`} className="plain">
            <TxRow tx={t} />
          </Link>
        ))}
      </div>
    </div>
  );
}
