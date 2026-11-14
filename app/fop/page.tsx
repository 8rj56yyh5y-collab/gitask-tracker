import Link from "next/link";
import { fopCardsCount, fopDuties, fopSettings, fopYear, fopIncome, FOP_DEFAULTS } from "@/lib/fop.ts";
import { formatMoney } from "@/lib/money.ts";
import { listPlans } from "@/lib/plans.ts";
import { fopToPlanAction, saveFopAction } from "../actions.ts";

const dmy = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

/** Налоги ФОП: что и когда платить, сколько осталось до лимита дохода. */
export default async function Fop({ searchParams }: { searchParams: Promise<{ saved?: string; added?: string; edit?: string }> }) {
  const sp = await searchParams;
  const s = fopSettings();
  const now = new Date();
  const duties = fopDuties(now, s);
  const year = fopYear(now, s);
  const cards = fopCardsCount();
  const planned = new Set(listPlans("open", 500, "out").map((p) => `${p.title}|${p.due_date}`));
  const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const qIncome = fopIncome(qStart, new Date(qStart.getFullYear(), qStart.getMonth() + 3, 1));
  const editing = !s.group || sp.edit === "1";
  const next = duties.find((d) => d.amount > 0);

  return (
    <div className="narrow-wide">
      <h1>Налоги ФОП</h1>
      {sp.saved && <div className="toast-row toast-pop">✓ Сохранено</div>}
      {sp.added && <div className="toast-row toast-pop">✓ Добавлено в «Платежи» — D&amp;N напомнит в день срока</div>}

      {s.group && (
        <>
          <section className="hero fop-hero">
            <span className="day-label">{next ? `Ближайший платёж · ${dmy(next.due)}` : "Ближайших платежей нет"}</span>
            {next && (
              <>
                <b className="day-sum">{formatMoney(next.amount)}</b>
                <span className="day-sub">
                  {next.title} · {next.period}
                </span>
              </>
            )}
            <div className="fop-year">
              <span>
                Доход ФОП за {now.getFullYear()}: <b>{formatMoney(year.income)}</b> из лимита {formatMoney(year.limit)}
              </span>
              <span className="fop-track">
                <i style={{ width: `${year.pct}%` }} className={year.pct >= 90 ? "is-hot" : ""} />
              </span>
              <span className="day-sub">
                {year.left >= 0 ? `до лимита ${s.group} группы осталось ${formatMoney(year.left)}` : `лимит превышен на ${formatMoney(-year.left)} — нужно переходить на общую систему`}
                {" · "}в этом квартале {formatMoney(qIncome)}
              </span>
            </div>
          </section>

          {cards === 0 && (
            <div className="card hint-warn">
              Доход ФОП считается по картам с типом «ФОП». Откройте <Link href="/cards" className="link">Карты</Link> → нужная карта → тип «ФОП». Карты ФОП из Monobank отмечаются сами.
            </div>
          )}

          <div className="today-head" style={{ marginTop: 18 }}>
            <h2>Что и когда платить</h2>
            <Link href="/fop?edit=1" className="link small">
              Настройки
            </Link>
          </div>
          <div className="card list-card">
            {duties.map((d) => {
              const key = `${d.title} (${d.period})|${d.due}`;
              return (
                <div key={`${d.title}${d.due}${d.period}`} className="wallet-row">
                  <span className="date-chip">
                    <b>{new Date(`${d.due}T12:00:00`).getDate()}</b>
                    <span>{new Date(`${d.due}T12:00:00`).toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}</span>
                  </span>
                  <span className="wallet-main">
                    <strong>{d.title}</strong>
                    <span className="muted small">
                      {d.period}
                      {d.note ? ` · ${d.note}` : ""}
                    </span>
                  </span>
                  {d.amount > 0 ? (
                    planned.has(key) ? (
                      <span className="fop-done">
                        <b className="num">{formatMoney(d.amount)}</b>
                        <small>в платежах ✓</small>
                      </span>
                    ) : (
                      <form action={fopToPlanAction} className="fop-add">
                        <input type="hidden" name="title" value={`${d.title} (${d.period})`} />
                        <input type="hidden" name="amount" value={d.amount} />
                        <input type="hidden" name="due" value={d.due} />
                        <b className="num">{formatMoney(d.amount)}</b>
                        <button className="btn btn-sm">В платежи</button>
                      </form>
                    )
                  ) : (
                    <span className="muted small">без оплаты</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="muted small fop-note">
            Это помощник, а не бухгалтер: суммы посчитаны по поступлениям на карты ФОП и ставкам из настроек. Сверяйте с Электронным кабинетом налогоплательщика.
          </p>
        </>
      )}

      {editing && (
        <form action={saveFopAction} className="card form" id="settings">
          <h2>{s.group ? "Настройки" : "Вы ФОП? Настроим за минуту"}</h2>
          <fieldset className="chips-field">
            <legend>Группа единого налога</legend>
            <div className="chips">
              {[
                ["3", "3 группа — % от дохода"],
                ["2", "2 группа — фиксированный налог"],
                ["", "Я не ФОП"],
              ].map(([v, t]) => (
                <label key={v} className="chip-opt">
                  <input type="radio" name="group" value={v} defaultChecked={String(s.group ?? "") === v} />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid-2-tight">
            <label>
              Ставка для 3 группы, %
              <input name="rate" inputMode="decimal" defaultValue={s.rate} />
            </label>
            <label>
              Минимальная зарплата, ₴
              <input name="minWage" inputMode="decimal" defaultValue={s.minWage / 100} />
            </label>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            По умолчанию — {FOP_DEFAULTS.rate}% и минималка {formatMoney(FOP_DEFAULTS.minWage)} (на 2026 год). Если в новом году цифры поменяются — поправьте здесь.
          </p>
          <button className="btn btn-primary btn-big">Сохранить</button>
        </form>
      )}
    </div>
  );
}
