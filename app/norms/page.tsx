import Link from "next/link";
import { acceptNormsAction, extendNormAction, restartNormAction } from "../actions.ts";
import { formatMoney } from "@/lib/money.ts";
import { normState } from "@/lib/norms.ts";

export const dynamic = "force-dynamic";

export default async function Norms({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const s = normState();
  const pct = Math.min(100, Math.round((s.elapsed / s.days) * 100));
  const startText = new Date(`${s.start}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const withSpend = s.rows.filter((r) => r.spent > 0);

  return (
    <div className="narrow-wide">
      <h1>Норма трат</h1>
      <section className="card">
        {s.ready ? (
          <strong>{s.acceptedAt ? "Норма принята ✓" : "Норма готова"}</strong>
        ) : (
          <strong>
            Собираем данные: день {Math.min(s.elapsed + 1, s.days)} из {s.days}
          </strong>
        )}
        <div className="limit-track">
          <div className="limit-fill" style={{ width: `${pct}%`, background: s.ready ? "var(--green)" : "var(--accent)" }} />
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {s.ready
            ? `Посчитано по вашим тратам с ${startText} (${s.elapsed} дн.) и приведено к месяцу. Примите как есть, поправьте суммы или соберите ещё ${30} дней — норма станет точнее.`
            : `С ${startText} D&N смотрит, сколько уходит на каждое направление. Через ${s.daysLeft} дн. предложит норму на месяц — её можно будет принять, изменить или собирать дальше.`}
        </p>
        {ok && <p className="small pos-text">Готово: нормы стали лимитами направлений.</p>}
      </section>

      <form action={acceptNormsAction} className="card form">
        <h2>{s.ready ? "Предложенная норма на месяц" : "Пока по текущим данным"}</h2>
        {s.rows.length === 0 && <p className="muted small">Направлений пока нет.</p>}
        {s.rows.map((r) => (
          <label key={r.id} className="norm-row">
            <span className="norm-name">
              <span className="dot" style={{ background: r.color }} />
              <span>
                <strong>{r.name}</strong>
                <span className="muted small" style={{ display: "block" }}>
                  потрачено {formatMoney(r.spent)}
                  {r.budget > 0 && ` · сейчас лимит ${formatMoney(r.budget)}`}
                </span>
              </span>
            </span>
            <input
              name={`norm_${r.id}`}
              inputMode="decimal"
              defaultValue={(s.acceptedAt ? r.budget : r.suggested || r.budget) / 100 || ""}
              placeholder="без нормы"
              aria-label={`Норма для «${r.name}», ₴ в месяц`}
            />
          </label>
        ))}
        {s.rows.length > 0 && (
          <>
            <button className="btn btn-primary" disabled={!s.ready && withSpend.length === 0}>
              {s.ready ? "Принять норму" : "Принять сейчас"}
            </button>
            <p className="muted small" style={{ margin: 0 }}>
              Норма станет месячным лимитом направления — на главной будет видно, укладываетесь ли вы. Пустое поле — без нормы.
            </p>
          </>
        )}
      </form>

      <div className="row-gap">
        {s.ready && (
          <form action={extendNormAction}>
            <button className="btn">Собирать ещё 30 дней</button>
          </form>
        )}
        <form action={restartNormAction}>
          <button className="btn btn-ghost btn-sm">Начать сбор заново с сегодня</button>
        </form>
      </div>
      <p className="muted small">
        Лимиты можно поменять и позже в <Link href="/centers" className="link">Направлениях</Link>.
      </p>
    </div>
  );
}
