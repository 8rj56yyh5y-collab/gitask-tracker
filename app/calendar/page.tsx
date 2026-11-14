import Link from "next/link";
import { dailyTotals, listTxOn } from "@/lib/repo.ts";
import { formatMoney } from "@/lib/money.ts";
import { TxRow } from "../components/TxRow.tsx";

const WD = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/** Календарь трат: каждый день месяца — цветом по сумме; нажали день — его операции. */
export default async function Calendar({ searchParams }: { searchParams: Promise<{ m?: string; d?: string }> }) {
  const sp = await searchParams;
  const now = new Date();
  const [y, mo] = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m!.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const base = new Date(y, mo - 1, 1);
  const days = dailyTotals(base);
  const max = Math.max(1, ...days.map((d) => d.expense));
  const total = days.reduce((a, d) => a + d.expense, 0);
  const lead = (base.getDay() + 6) % 7; // понедельник — первый
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const sel = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? "") ? sp.d! : null;
  const selTx = sel ? listTxOn(sel) : [];
  const mKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const prev = mKey(new Date(y, mo - 2, 1));
  const next = mKey(new Date(y, mo, 1));
  const isFuture = new Date(y, mo, 1) > now;
  const passed = days.filter((d) => d.date <= todayKey);
  const zero = passed.filter((d) => d.expense === 0).length;
  const title = base.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(" г.", "");

  return (
    <div className="narrow-wide">
      <div className="page-head">
        <h1>Календарь</h1>
        <Link href={`/recap?m=${mKey(base)}`} className="btn btn-soft btn-sm">
          ✨ Итоги месяца
        </Link>
      </div>
      <div className="cal-nav">
        <Link href={`/calendar?m=${prev}`} className="cal-arrow" aria-label="Предыдущий месяц" scroll={false}>
          ‹
        </Link>
        <div>
          <strong className="cal-title">{title}</strong>
          <span className="muted small">
            потрачено {formatMoney(total)}
            {zero > 0 ? ` · ${zero} ${zero === 1 ? "день" : zero < 5 ? "дня" : "дней"} без трат` : ""}
          </span>
        </div>
        {isFuture ? (
          <span className="cal-arrow is-off" aria-hidden>
            ›
          </span>
        ) : (
          <Link href={`/calendar?m=${next}`} className="cal-arrow" aria-label="Следующий месяц" scroll={false}>
            ›
          </Link>
        )}
      </div>
      <div className="card cal">
        {WD.map((w) => (
          <span key={w} className="cal-wd">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`e${i}`} />
        ))}
        {days.map((d) => {
          const lvl = d.expense === 0 ? 0 : Math.max(1, Math.ceil((d.expense / max) * 4));
          const future = d.date > todayKey;
          return (
            <Link
              key={d.date}
              href={`/calendar?m=${mKey(base)}&d=${d.date}#day`}
              scroll={false}
              className={`cal-day lvl-${lvl} ${d.date === todayKey ? "is-today" : ""} ${d.date === sel ? "is-sel" : ""} ${future ? "is-future" : ""}`}
              aria-label={`${d.day}: ${d.expense ? formatMoney(d.expense) : "без трат"}`}
            >
              <b>{d.day}</b>
              {d.expense > 0 && <span>{d.expense >= 100000 ? `${Math.round(d.expense / 100000)}к` : Math.round(d.expense / 100)}</span>}
            </Link>
          );
        })}
      </div>
      <div className="cal-legend muted small">
        меньше <i className="lvl-1" /> <i className="lvl-2" /> <i className="lvl-3" /> <i className="lvl-4" /> больше
      </div>

      {sel && (
        <section id="day" className="today-sec">
          <div className="today-head">
            <h2>{new Date(`${sel}T12:00:00`).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}</h2>
            <span className="muted small">{formatMoney(days.find((d) => d.date === sel)?.expense ?? 0)}</span>
          </div>
          {selTx.length === 0 ? (
            <div className="all-clear">День без трат 🌿</div>
          ) : (
            <div className="card list-card">
              {selTx.map((t) => (
                <Link key={t.id} href={`/inbox/${t.id}`} className="plain">
                  <TxRow tx={t} />
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
