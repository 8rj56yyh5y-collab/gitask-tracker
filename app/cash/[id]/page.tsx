import Link from "next/link";
import { notFound } from "next/navigation";
import { adjustCashboxAction, setCashFactAction, archiveCashboxAction, cashMoveAction, createPlanAction, payPlanAction, setCashboxPotAction, transferAction, updateCashboxAction } from "../../actions.ts";
import { AccountSelect } from "../../components/AccountSelect.tsx";
import { CenterSelect } from "../../components/CenterSelect.tsx";
import { CategoryChips, CenterChips } from "../../components/Pickers.tsx";
import { popularCategories } from "@/lib/categories.ts";
import { TxRow } from "../../components/TxRow.tsx";
import { boxScope, cashFactAt, cashPending, cashStats, directionNonCash, getCashbox } from "@/lib/cash.ts";
import { getDb } from "@/lib/db.ts";
import { formatMoney, curSymbol } from "@/lib/money.ts";
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

export default async function CashboxPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ op?: string; fix?: string; to?: string; sign?: string; note?: string; fixed?: string; wait?: string; hand?: string; facted?: string }> }) {
  const { id: raw } = await params;
  const { op: rawOp, fix, to: fixTo, sign: fixSign, note: fixNote, fixed, wait, hand, facted } = await searchParams;
  const op = rawOp === "in" || rawOp === "move" ? rawOp : "out";
  const b = getCashbox(Number(raw));
  if (!b || b.archived) notFound();
  const st = cashStats(b.id);
  const balance = st.balance;
  const fixRaw = String(fixTo ?? "").replace(/\s/g, "").replace(",", ".");
  const fixAbs = fixRaw && Number.isFinite(Number(fixRaw)) ? Math.round(Math.abs(Number(fixRaw)) * 100) : null;
  const fixActual = fixAbs === null ? null : fixSign === "minus" || fixRaw.startsWith("-") ? -fixAbs : fixAbs;
  const factNow = cashFactAt(b);
  const hasFact = factNow !== null;
  const fact = factNow?.amount ?? 0;
  const factDate = b.fact_at ? new Date(b.fact_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "";
  const pending = cashPending(b);
  const mb = monthBounds();
  const nonCash = b.pot ? directionNonCash(b, mb.from, mb.to) : { in: 0, out: 0, n: 0 };
  const pendingSum = pending.reduce((a, p) => a + p.left, 0);
  const afterPay = balance - pendingSum;
  const fmtSigned = (k: number) => `${k < 0 ? "−" : ""}${formatMoney(Math.abs(k))}`;
  const center = b.center_id ? getCenter(b.center_id) : null;
  const { from, to } = monthBounds();
  const moves = getDb()
    .prepare(
      `SELECT t.*, cc.name AS center_name, cc.color AS center_color, cb.name AS cashbox_name FROM transactions t
       LEFT JOIN cost_centers cc ON cc.id = t.cost_center_id LEFT JOIN cashboxes cb ON cb.id = t.cashbox_id
       WHERE ${boxScope(b)} ORDER BY t.occurred_at DESC LIMIT 500`,
    )
    .all() as unknown as Tx[];
  void from;
  void to;
  const plans = listPlans("open", 200, "out");
  const base = `/cash/${b.id}`;
  const next = base;
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
          <span className="cash-hero-name">{b.name}</span>
          {center && (b.pot ? <span className="cash-hero-tag">касса и направление</span> : center.name !== b.name && <span className="cash-hero-tag">{center.name}</span>)}
        </div>
        <div className="cash-hero-label">В кассе</div>
        <div className={`cash-hero-balance${balance < 0 ? " is-neg" : ""}`}>{fmtSigned(balance)}</div>
        {(hasFact || pendingSum > 0) && (
          <div className="cash-hero-chips">
            {hasFact && (
              <a href={`${base}?hand=1#hand`} title={`пересчёт ${factDate}: ${fmtSigned(factNow?.base ?? 0)}${factNow?.since ? `, потом ${factNow.since > 0 ? "+" : "−"}${formatMoney(Math.abs(factNow.since))}` : ""}`}>
                На руках <b>{fmtSigned(fact)}</b>
              </a>
            )}
            {pendingSum > 0 && (
              <a href="#wait">
                Ждут оплаты <b>{formatMoney(pendingSum)}</b>
              </a>
            )}
          </div>
        )}
      </section>

      <nav className="cash-actions" aria-label="Действия с кассой">
        <Link href={`${base}?op=out#op`} className={rawOp === "out" ? "on" : undefined}>
          <span aria-hidden>−</span>Расход
        </Link>
        <Link href={`${base}?op=in#op`} className={rawOp === "in" ? "on" : undefined}>
          <span aria-hidden>+</span>Приход
        </Link>
        <Link href={`${base}?op=move#op`} className={rawOp === "move" ? "on" : undefined}>
          <span aria-hidden>↔</span>Перевод
        </Link>
      </nav>

      {facted && (
        <div className="card fix-done" role="status">
          ✓ Записано, сколько на руках. Учёт и траты не менялись — в отчёте будет отдельная строка «На руках по факту».
        </div>
      )}

      {hand && (
        <form id="hand" action={setCashFactAction} className="card form fix-card">
          <input type="hidden" name="id" value={b.id} />
          <h2>Сколько на руках по факту</h2>
          <p className="muted small">
            Записали трату заранее (например, заказали фару и заплатите при получении на почте), и по учёту в кассе меньше, чем лежит на самом деле? Впишите,
            сколько наличных у вас <b>на руках сейчас</b>. Это отдельная цифра: учёт, траты и история <b>не меняются</b>. Дальше она сама меняется: траты
            наличными её уменьшают, приходы — увеличивают (операции с карт — нет). Новый заказ с оплатой при получении лучше записать в «Ожидают оплаты» —
            тогда он не уменьшит «на руках» раньше времени.
          </p>
          <div className="sign-seg" role="radiogroup" aria-label="Плюс или минус">
            <label>
              <input type="radio" name="sign" value="plus" defaultChecked={!hasFact || fact >= 0} />
              <span>＋ Есть деньги</span>
            </label>
            <label>
              <input type="radio" name="sign" value="minus" defaultChecked={hasFact && fact < 0} />
              <span>− В минусе</span>
            </label>
          </div>
          <label className="amount-field">
            <input name="fact" inputMode="decimal" required placeholder="0" defaultValue={hasFact ? String(Math.abs(fact) / 100) : ""} className="amount-input" aria-label="Сколько на руках" autoFocus />
            <span className="amount-cur" aria-hidden>
              {curSymbol()}
            </span>
          </label>
          <div className="fix-btns">
            <Link href={base} className="btn btn-ghost">
              Отмена
            </Link>
            <button className="btn btn-primary">Сохранить</button>
          </div>
          {hasFact && (
            <button name="clear" value="1" formNoValidate className="btn btn-ghost btn-sm danger">
              Не показывать «на руках»
            </button>
          )}
        </form>
      )}

      {fixed && (
        <div className="card fix-done" role="status">
          ✓ Остаток поправлен. В истории появилась запись «Корректировка остатка» — если ошиблись, откройте её и удалите.
        </div>
      )}

      {fix && fixActual === null && (
        <form id="fix" method="get" action={base} className="card form fix-card">
          <input type="hidden" name="fix" value="1" />
          <h2>Поправить остаток</h2>
          <p className="muted small">
            Пересчитали деньги и в кассе не столько, сколько показывает D&amp;N? Впишите, сколько <b>на самом деле</b>. Если касса ушла в минус (потратили больше, чем было), выберите «− В минусе». Разница запишется в историю как
            «Корректировка остатка» — это не трата и не приход, в отчёте её видно отдельно.
          </p>
          <div className="sign-seg" role="radiogroup" aria-label="Плюс или минус">
            <label>
              <input type="radio" name="sign" value="plus" defaultChecked={balance >= 0} />
              <span>＋ Есть деньги</span>
            </label>
            <label>
              <input type="radio" name="sign" value="minus" defaultChecked={balance < 0} />
              <span>− В минусе</span>
            </label>
          </div>
          <label className="amount-field">
            <input name="to" inputMode="decimal" required defaultValue={String(Math.abs(balance) / 100)} className="amount-input" aria-label="Сколько в кассе на самом деле" autoFocus />
            <span className="amount-cur" aria-hidden>
              {curSymbol()}
            </span>
          </label>
          <label>
            Почему (необязательно)
            <input name="note" placeholder="например, пересчитал кассу; забыл записать бензин" />
          </label>
          <div className="fix-btns">
            <Link href={base} className="btn btn-ghost">
              Отмена
            </Link>
            <button className="btn btn-primary">Дальше</button>
          </div>
        </form>
      )}

      {fix && fixActual !== null && (
        <form id="fix" action={adjustCashboxAction} className="card form fix-card fix-confirm">
          <input type="hidden" name="id" value={b.id} />
          <input type="hidden" name="actual" value={String(fixActual / 100)} />
          <input type="hidden" name="note" value={fixNote ?? ""} />
          <input type="hidden" name="confirm" value="yes" />
          <h2>Проверьте и подтвердите</h2>
          <div className="fix-diff">
            <div>
              <span className="muted small">Сейчас</span>
              <b className="num">{fmtSigned(balance)}</b>
            </div>
            <span className="fix-arrow" aria-hidden>
              →
            </span>
            <div>
              <span className="muted small">Станет</span>
              <b className={`num${fixActual < 0 ? " danger" : ""}`}>{fmtSigned(fixActual)}</b>
            </div>
          </div>
          {fixActual === balance ? (
            <p className="muted">Остаток уже такой — менять нечего.</p>
          ) : (
            <p>
              В историю запишется корректировка{" "}
              <b className={fixActual > balance ? "pos-text" : "danger"} style={{ whiteSpace: "nowrap" }}>
                {fixActual > balance ? "+" : "−"}
                {formatMoney(Math.abs(fixActual - balance))}
              </b>
              {fixNote ? <> — «{fixNote}»</> : null}.
            </p>
          )}
          <div className="fix-btns">
            <Link href={`${base}?fix=1#fix`} className="btn btn-ghost">
              ← Изменить сумму
            </Link>
            {fixActual !== balance && <button className="btn btn-primary">Да, поправить</button>}
          </div>
        </form>
      )}

      {rawOp && (
        <div id="op">
      {op !== "move" ? (
        <form action={cashMoveAction} className="card form form-big">
          <input type="hidden" name="id" value={b.id} />
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="dir" value={op} />
          <label className="amount-field">
            <input name="amount" inputMode="decimal" required placeholder="0" className="amount-input" aria-label="Сумма в гривнах" />
            <span className="amount-cur" aria-hidden>
              {curSymbol()}
            </span>
          </label>
          <label>
            {op === "out" ? "За что" : "Откуда деньги"}
            <input name="who" placeholder={op === "out" ? "например, Продукты, Бензин" : "например, Выручка, Из сейфа"} />
          </label>
          {op === "out" && (
            <CenterChips label="Направление" defaultValue={b.center_id} withNone="Выберу позже" includeInternal={false} />
          )}
          {op === "out" && <CategoryChips label="Категория — на что именно" suggested={popularCategories(6)} />}
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
              {curSymbol()}
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
        </div>
      )}

      <section className="card cash-month">
        <div className="cash-month-row">
          <span>{monthName[0].toUpperCase() + monthName.slice(1)}</span>
          <span className="pos-text">+{formatMoney(st.monthIn)}</span>
          <span>−{formatMoney(st.monthOut)}</span>
        </div>
        {nonCash.out > 0 && center && (
          <p className="muted small">
            Ещё с карт по «{center.name}» в этом месяце: −{formatMoney(nonCash.out)} ({nonCash.n} шт.) — наличные это не меняет, поэтому в кассу не входит. В отчёте
            направления эти траты есть.
          </p>
        )}
      </section>

      {pending.length > 0 && (
      <section id="wait" className="card wait-card">
        <div className="wait-head">
          <h2>Ожидают оплаты</h2>
          {pendingSum > 0 && <b className="num">−{formatMoney(pendingSum)}</b>}
        </div>
        {pending.length > 0 && (
          <div className="wait-list">
            {pending.map((p) => (
              <form key={p.id} action={payPlanAction} className="wait-item">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="amount" value={String(p.left / 100)} />
                <input type="hidden" name="account" value={`cash:${b.id}`} />
                <input type="hidden" name="next" value={base} />
                <Link href={`/plans/${p.id}`} className="wait-what plain">
                  <strong>{p.title}</strong>
                  <span className="muted small">
                    {[p.payee, p.due ? `до ${new Date(`${p.due}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}` : ""].filter(Boolean).join(" · ") || "когда придёт"}
                  </span>
                </Link>
                <b className="num">{formatMoney(p.left)}</b>
                <button className="btn btn-sm btn-primary">Оплатил</button>
              </form>
            ))}
            <div className="wait-total">
              <span>В кассе сейчас</span>
              <b className="num">{fmtSigned(balance)}</b>
              <span>После всех оплат</span>
              <b className={`num${afterPay < 0 ? " danger" : ""}`}>{fmtSigned(afterPay)}</b>
            </div>
          </div>
        )}

      </section>
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

      <details className="card settings-fold" open={Boolean(wait) || undefined}>
        <summary>Ещё: сверка, ожидаемые оплаты, настройки</summary>
        <div className="more-links">
          <Link href={`${base}?hand=1#hand`}>✋ {hasFact ? "Обновить, сколько на руках" : "Сколько на руках по факту"}</Link>
          <Link href={`${base}?fix=1#fix`}>✎ Поправить учёт (если ошиблись в записях)</Link>
        </div>
        <details className="more-fields" open={Boolean(wait) || undefined}>
          <summary>⏳ Заказал, оплачу при получении</summary>
          <p className="muted small">Например, наложенный платёж на почте. Из кассы не списывается, пока не нажмёте «Оплатил».</p>
          <form action={createPlanAction} className="form" style={{ marginTop: 10 }}>
            <input type="hidden" name="account" value={`cash:${b.id}`} />
            <input type="hidden" name="direction" value="out" />
            {b.center_id && <input type="hidden" name="centerId" value={b.center_id} />}
            <input type="hidden" name="next" value={`${base}#wait`} />
            <label>
              Что заказали
              <input name="title" required placeholder="например, запчасти — наложенный платёж" />
            </label>
            <div className="grid-2-tight">
              <label>
                Сколько заплатить, {curSymbol()}
                <input name="total" inputMode="decimal" required placeholder="0" />
              </label>
              <label>
                Когда примерно
                <input name="due" type="date" />
              </label>
            </div>
            <label>
              Где / кому (необязательно)
              <input name="payee" placeholder="например, Нова пошта" />
            </label>
            <button className="btn btn-primary">Добавить</button>
          </form>
        </details>
        <h3 className="more-h">Настройки кассы</h3>
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
              Сколько было в начале, {curSymbol()}
              <input name="opening" inputMode="decimal" defaultValue={Math.abs(b.opening) / 100} />
              <select name="openingSign" defaultValue={b.opening < 0 ? "minus" : "plus"} aria-label="Плюс или минус">
                <option value="plus">＋ в плюсе</option>
                <option value="minus">− в минусе</option>
              </select>
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
      {center && (
        <form action={setCashboxPotAction} className={`pot-card${b.pot ? " on" : ""}`}>
          <input type="hidden" name="id" value={b.id} />
          <input type="hidden" name="on" value={b.pot ? "0" : "1"} />
          <div>
            <strong>{b.pot ? `✓ Касса и направление «${center.name}» — одно целое` : `Считать все траты и приходы «${center.name}»`}</strong>
            <p className="muted">
              {b.pot
                ? `Здесь видны все траты и приходы направления «${center.name}» — с карт тоже, — и движения кассы. Ничего не переносится и не удаляется: это тот же учёт, просто в одном месте.`
                : `Сейчас касса показывает только свои движения. Включите — и здесь, и в отчёте будут все траты и приходы направления «${center.name}». Записи не меняются.`}
            </p>
          </div>
          <button className={b.pot ? "btn btn-ghost" : "btn btn-primary"}>{b.pot ? "Только наличные" : "Объединить"}</button>
        </form>
      )}
      </details>
    </div>
  );
}
