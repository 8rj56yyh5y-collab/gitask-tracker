import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveCashboxAction, cashMoveAction, transferAction, updateCashboxAction } from "../../actions.ts";
import { AccountSelect } from "../../components/AccountSelect.tsx";
import { CenterSelect } from "../../components/CenterSelect.tsx";
import { CenterChips, SegTabs } from "../../components/Pickers.tsx";
import { TxRow } from "../../components/TxRow.tsx";
import { cashStats, getCashbox } from "@/lib/cash.ts";
import { getDb } from "@/lib/db.ts";
import { formatMoney } from "@/lib/money.ts";
import { listPlans } from "@/lib/plans.ts";
import { getCenter, monthBounds, type Tx } from "@/lib/repo.ts";

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const dayTitle = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  if (d.toDateString() === y.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" });
};

export default async function CashboxPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ op?: string }> }) {
  const { id: raw } = await params;
  const { op: rawOp } = await searchParams;
  const op = rawOp === "in" || rawOp === "move" ? rawOp : "out";
  const b = getCashbox(Number(raw));
  if (!b || b.archived) notFound();
  const st = cashStats(b.id);
  const balance = st.balance;
  const center = b.center_id ? getCenter(b.center_id) : null;
  const { from, to } = monthBounds();
  const moves = getDb()
    .prepare(
      `SELECT t.*, cc.name AS center_name, cc.color AS center_color, cb.name AS cashbox_name FROM transactions t
       LEFT JOIN cost_centers cc ON cc.id = t.cost_center_id LEFT JOIN cashboxes cb ON cb.id = t.cashbox_id
       WHERE t.cashbox_id = ? ORDER BY t.occurred_at DESC LIMIT 300`,
    )
    .all(b.id) as unknown as Tx[];
  void from;
  void to;
  const maxBar = Math.max(1, ...st.months.map((x) => Math.max(x.in, x.out)));
  const plans = listPlans("open", 200, "out");
  const base = `/cash/${b.id}`;
  const next = `${base}?op=${op}`;
  const monthName = new Date().toLocaleDateString("ru-RU", { month: "long" });

  // История по дням
  const days: { key: string; title: string; total: number; list: Tx[] }[] = [];
  for (const t of moves) {
    const k = dayKey(t.occurred_at);
    let d = days[days.length - 1];
    if (!d || d.key !== k) days.push((d = { key: k, title: dayTitle(t.occurred_at), total: 0, list: [] }));
    d.total += t.amount;
    d.list.push(t);
  }

  return (
    <div className="narrow-wide">
      <div className="crumbs">
        <Link href="/cash">Кассы</Link>
        {center && (
          <>
            {" › "}
            <Link href={`/centers/${center.id}`}>{center.name}</Link>
          </>
        )}
      </div>

      <section className="cash-hero" style={{ "--c": b.color } as React.CSSProperties}>
        <div className="cash-hero-top">
          <span className="cash-hero-name">💵 {b.name}</span>
          {center && center.name !== b.name && <span className="cash-hero-tag">{center.name}</span>}
        </div>
        <div className="cash-hero-label">В кассе сейчас</div>
        <div className="cash-hero-balance">{formatMoney(balance)}</div>
        {st.forecastEnd !== null && (
          <div className="cash-hero-forecast">
            К концу месяца будет ≈ <b>{formatMoney(st.forecastEnd)}</b>
          </div>
        )}
      </section>

      <section className="card stats-card">
        <h2>{monthName[0].toUpperCase() + monthName.slice(1)}</h2>
        <div className="stat-tiles">
          <div className="stat-tile">
            <span>Приход</span>
            <strong className="pos-text">+{formatMoney(st.monthIn)}</strong>
          </div>
          <div className="stat-tile">
            <span>Расход</span>
            <strong>−{formatMoney(st.monthOut)}</strong>
          </div>
          <div className="stat-tile">
            <span>Итог</span>
            <strong className={st.monthNet >= 0 ? "pos-text" : "danger"}>
              {st.monthNet >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(st.monthNet))}
            </strong>
          </div>
        </div>
        <div className="forecast">
          {st.dataDays === 0 ? (
            <span>Прогноз появится, когда в кассе будут операции.</span>
          ) : st.forecastEnd === null ? (
            <span>Собираем данные для прогноза: ещё {7 - st.dataDays} дн. Точный прогноз — через {st.daysToAccurate} дн.</span>
          ) : (
            <>
              <span>
                В среднем за день: <b className={st.perDay >= 0 ? "pos-text" : undefined}>{st.perDay >= 0 ? "+" : "−"}{formatMoney(Math.abs(st.perDay))}</b>
              </span>
              <span>
                К концу месяца в кассе будет ≈ <b>{formatMoney(st.forecastEnd)}</b>
                {st.daysToAccurate > 0 && <em> · предварительно, по {st.dataDays} дн.; точнее — через {st.daysToAccurate} дн.</em>}
              </span>
            </>
          )}
        </div>
        {st.months.some((x) => x.in || x.out) && (
          <div className="mini-bars" aria-label="Приход и расход по месяцам">
            {st.months.map((x) => (
              <div key={x.key} className="mini-bar">
                <div className="mini-bar-cols">
                  <i className="in" style={{ height: `${(x.in / maxBar) * 100}%` }} title={`Приход ${formatMoney(x.in)}`} />
                  <i className="out" style={{ height: `${(x.out / maxBar) * 100}%` }} title={`Расход ${formatMoney(x.out)}`} />
                </div>
                <span>{x.label}</span>
              </div>
            ))}
          </div>
        )}
        {st.months.some((x) => x.in || x.out) && (
          <div className="legend">
            <span><i className="in" /> приход</span>
            <span><i className="out" /> расход</span>
          </div>
        )}
      </section>

      <SegTabs
        active={op}
        tabs={[
          { id: "out", label: "− Расход", href: `${base}?op=out` },
          { id: "in", label: "+ Приход", href: `${base}?op=in` },
          { id: "move", label: "↔ Перевод", href: `${base}?op=move` },
        ]}
      />

      {op !== "move" ? (
        <form action={cashMoveAction} className="card form form-big">
          <input type="hidden" name="id" value={b.id} />
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="dir" value={op} />
          <label className="amount-field">
            <input name="amount" inputMode="decimal" required placeholder="0" className="amount-input" aria-label="Сумма в гривнах" />
            <span className="amount-cur" aria-hidden>
              ₴
            </span>
          </label>
          <label>
            {op === "out" ? "За что" : "Откуда деньги"}
            <input name="who" placeholder={op === "out" ? "например, Продукты, Бензин" : "например, Выручка, Из сейфа"} />
          </label>
          {op === "out" && (
            <CenterChips label="Направление" defaultValue={b.center_id} withNone="Выберу позже" includeInternal={false} />
          )}
          {op === "out" && plans.length > 0 && (
            <label>
              Это оплата запланированного платежа?
              <select name="planId" defaultValue="">
                <option value="">Нет</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} · осталось {formatMoney(p.total - p.paid)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <details className="more-fields">
            <summary>Комментарий и дата</summary>
            <div className="form">
              <label>
                Комментарий
                <input name="note" />
              </label>
              <label>
                Дата
                <input name="at" type="date" />
              </label>
            </div>
          </details>
          <button className="btn btn-primary btn-big">{op === "out" ? "Записать расход" : "Записать приход"}</button>
        </form>
      ) : (
        <form action={transferAction} className="card form form-big">
          <input type="hidden" name="from" value={`cash:${b.id}`} />
          <input type="hidden" name="next" value={next} />
          <label className="amount-field">
            <input name="amount" inputMode="decimal" required placeholder="0" className="amount-input" aria-label="Сумма в гривнах" />
            <span className="amount-cur" aria-hidden>
              ₴
            </span>
          </label>
          <label>
            Куда переложить
            <AccountSelect name="to" />
          </label>
          <label>
            Комментарий
            <input name="note" placeholder="например, положил на карту" />
          </label>
          <button className="btn btn-primary btn-big">Перевести</button>
          <p className="muted small" style={{ margin: 0 }}>
            Перевод в другую кассу или на карту — это не расход. Чтобы положить деньги в эту кассу с карты, сделайте перевод на карте или в
            разделе «＋ → Перевод».
          </p>
        </form>
      )}

      <section className="history">
        <h2>История кассы</h2>
        {days.length === 0 && <div className="card muted small">Пока ничего не было. Запишите первый приход или расход выше.</div>}
        {days.map((d) => (
          <div key={d.key} className="day">
            <div className="day-head">
              <span>{d.title}</span>
              <span className={d.total >= 0 ? "pos-text" : undefined}>
                {d.total >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(d.total))}
              </span>
            </div>
            <div className="card day-list">
              {d.list.map((t) => (
                <Link key={t.id} href={`/inbox/${t.id}`} className="plain">
                  <TxRow tx={t} />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      <details className="card settings-fold">
        <summary>Настройки кассы</summary>
        <form action={updateCashboxAction} className="form" style={{ marginTop: 12 }}>
          <input type="hidden" name="id" value={b.id} />
          <input type="hidden" name="next" value={base} />
          <label>
            Название
            <input name="name" defaultValue={b.name} required />
          </label>
          <label>
            Чья касса
            <input name="owner" defaultValue={b.owner} placeholder="необязательно" />
          </label>
          <label>
            Направление
            <CenterSelect defaultValue={b.center_id} none="Для разных направлений" />
          </label>
          <div className="grid-2-tight">
            <label>
              Сколько было в начале, ₴
              <input name="opening" inputMode="decimal" defaultValue={b.opening / 100} />
            </label>
            <label>
              Цвет
              <input name="color" type="color" defaultValue={b.color} />
            </label>
          </div>
          <button className="btn">Сохранить</button>
        </form>
        <form action={archiveCashboxAction} style={{ marginTop: 8 }}>
          <input type="hidden" name="id" value={b.id} />
          <button className="btn btn-ghost btn-sm danger">Скрыть кассу</button>
        </form>
      </details>
    </div>
  );
}
