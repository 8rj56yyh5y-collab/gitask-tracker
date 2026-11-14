import { forecast30 } from "@/lib/forecast.ts";
import { formatMoney as fmtExact } from "@/lib/money.ts";

// В прогнозе копейки не нужны — только гривны.
const formatMoney = (kop: number) => fmtExact(Math.round(kop / 100) * 100);
import { setForecastStartAction } from "../actions.ts";

const dm = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");

/** Прогноз денег на 30 дней — линия по дням, зарплата и платежи отмечены. */
export default function ForecastPage() {
  const f = forecast30();
  const vals = f.days.map((d) => d.balance);
  const max = Math.max(0, ...vals);
  const min = Math.min(0, ...vals);
  const W = 340;
  const H = 170;
  const pad = 14;
  const x = (i: number) => pad + (i / 30) * (W - pad * 2);
  const y = (v: number) => pad + ((max - v) / (max - min || 1)) * (H - pad * 2);
  const path = f.days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.balance).toFixed(1)}`).join(" ");
  const area = `${path} L${x(30)},${y(min)} L${x(0)},${y(min)} Z`;
  const events = f.days.flatMap((d) => d.events.map((e) => ({ ...e, date: d.date })));

  return (
    <div className="narrow-wide">
      <h1>Прогноз на 30 дней</h1>

      <section className={`hero forecast-hero ${f.shortDay ? "is-short" : ""}`}>
        <span className="day-label">Через 30 дней будет</span>
        <b className="day-sum">{f.end < 0 ? `−${formatMoney(-f.end)}` : formatMoney(f.end)}</b>
        <span className="day-sub">
          {f.shortDay
            ? `⚠️ С ${dm(f.shortDay.date)} денег не хватит — минимум ${formatMoney(f.min.balance)} ${dm(f.min.date)}`
            : `Самый низкий момент — ${dm(f.min.date)}: ${formatMoney(f.min.balance)}`}
        </span>
        <svg viewBox={`0 0 ${W} ${H}`} className="fc-chart" role="img" aria-label="Деньги по дням на 30 дней вперёд">
          <defs>
            <linearGradient id="fcg" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.35" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {min < 0 && <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} className="fc-zero" />}
          <path d={area} fill="url(#fcg)" className="fc-area" />
          <path d={path} fill="none" className="fc-line" />
          {f.days.map((d, i) =>
            d.events.length ? <circle key={d.date} cx={x(i)} cy={y(d.balance)} r="4.5" className={d.events.some((e) => e.amount > 0) ? "fc-in" : "fc-out"} /> : null,
          )}
          <text x={pad} y={H - 2} className="fc-axis">
            сегодня
          </text>
          <text x={W - pad} y={H - 2} textAnchor="end" className="fc-axis">
            {dm(f.days[30].date)}
          </text>
        </svg>
      </section>

      <form action={setForecastStartAction} className="card fc-start">
        <label>
          <span>
            <b>Сколько у вас денег сейчас — всего?</b>
            <span className="muted small">
              {f.startKnown ? " Дальше D&N сам учитывает новые траты и доходы." : " Пока взяты только наличные в кассах. Впишите сумму на всех картах и наличными — прогноз станет точным."}
            </span>
          </span>
          <span className="fc-start-row">
            <input name="amount" inputMode="decimal" defaultValue={Math.round(f.start / 100)} aria-label="Сколько денег сейчас, ₴" />
            <button className="btn btn-primary btn-sm">Пересчитать</button>
          </span>
        </label>
      </form>

      <div className="today-head" style={{ marginTop: 18 }}>
        <h2>Что учтено</h2>
      </div>
      <div className="card list-card">
        <div className="wallet-row">
          <span className="wallet-emoji" aria-hidden>
            🧾
          </span>
          <span className="wallet-main">
            <strong>Обычные траты</strong>
            <span className="muted small">в среднем за 60 дней, без платежей по плану</span>
          </span>
          <b className="num wallet-amt">−{formatMoney(f.perDay)}/день</b>
        </div>
        {events.map((e, i) => (
          <div key={i} className="wallet-row">
            <span className="date-chip">
              <b>{new Date(`${e.date}T12:00:00`).getDate()}</b>
              <span>{new Date(`${e.date}T12:00:00`).toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}</span>
            </span>
            <span className="wallet-main">
              <strong>{e.title}</strong>
              <span className="muted small">{e.amount > 0 ? "придёт" : "платёж"}</span>
            </span>
            <b className={`num wallet-amt ${e.amount > 0 ? "pos-text" : ""}`}>
              {e.amount > 0 ? "+" : "−"}
              {formatMoney(Math.abs(e.amount))}
            </b>
          </div>
        ))}
        {events.length === 0 && <p className="muted small" style={{ padding: "8px 0" }}>Платежей и зарплаты в ближайшие 30 дней не записано — добавьте их в «Платежи» и «Доходы», и прогноз их учтёт.</p>}
      </div>
    </div>
  );
}
