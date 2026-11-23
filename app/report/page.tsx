import Link from "next/link";
import { buildReport, parseScope, periodTitle, presetRange, scopeKey } from "@/lib/report.ts";
import { centerTree } from "@/lib/repo.ts";
import { listCashboxes } from "@/lib/cash.ts";
import { formatMoney, curSymbol } from "@/lib/money.ts";
import { getSetting, setSetting } from "@/lib/settings.ts";
import { telegramState } from "@/lib/telegram.ts";
import { isSimple } from "@/lib/mode.ts";
import { createCashboxAction, sendReportAction, toggleReportAutoAction } from "../actions.ts";
import { CopyButton } from "../components/CopyButton.tsx";

type SP = { scope?: string; from?: string; to?: string; p?: string; sent?: string; err?: string };

const PRESETS = [
  { id: "lastweek", label: "Прошлая неделя" },
  { id: "week", label: "Эта неделя" },
  { id: "month", label: "Этот месяц" },
  { id: "prevmonth", label: "Прошлый месяц" },
];

const okDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Отчёт за период: выбрали даты и «чьи деньги» — видно итог, и можно скачать Excel или отправить в Telegram. */
export default async function ReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const simple = isSimple();
  // Последний выбранный разрез запоминаем: отчёт руководителю каждую неделю — один и тот же.
  const scopeRaw = sp.scope ?? getSetting("report_scope") ?? "";
  if (sp.scope !== undefined && sp.scope !== (getSetting("report_scope") ?? "")) setSetting("report_scope", sp.scope || null);
  const scope = simple ? parseScope("") : parseScope(scopeRaw);
  const preset = PRESETS.find((p) => p.id === sp.p)?.id ?? (okDate(sp.from) ? "" : "lastweek");
  const range = preset ? presetRange(preset) : { from: okDate(sp.from)!, to: okDate(sp.to) ?? okDate(sp.from)! };
  const from = range.from <= range.to ? range.from : range.to;
  const to = range.from <= range.to ? range.to : range.from;
  const r = buildReport(scope, from, to);
  const centers = centerTree().filter((c) => !c.is_internal);
  const boxes = listCashboxes();
  // «Касса = направление» — один пункт вместо двух одинаковых.
  const potCenters = new Set(boxes.filter((b) => b.pot && b.center_id).map((b) => b.center_id as number));
  let shown = scope;
  if (scope.kind === "cash") {
    const pb = boxes.find((b) => b.id === scope.id && b.pot && b.center_id);
    if (pb) shown = { kind: "center", id: pb.center_id as number };
  }
  const key = scopeKey(shown);
  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ scope: key, from, to, ...extra });
    return p.toString();
  };
  const tg = telegramState();
  const auto = getSetting("report_auto") === "1";
  const centerNoBox = scope.kind === "center" && !boxes.some((b) => b.center_id === scope.id);
  const text = [
    r.title,
    r.cash ? `Наличные на начало: ${formatMoney(r.cash.start)}` : null,
    `Приходы: ${formatMoney(r.income)}`,
    `Расходы: ${formatMoney(r.expense)}`,
    `Итог: ${formatMoney(r.net)}`,
    r.cash ? `Наличные на конец: ${formatMoney(r.cash.end)}` : null,
    r.cash?.fact ? `На руках по факту: ${formatMoney(r.cash.fact.amount)}` : null,
    r.pending.length ? `Ожидают оплаты: ${formatMoney(r.pending.reduce((a, p) => a + p.left, 0))}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="narrow-wide report">
      <h1>Отчёт</h1>
      <p className="page-hint">Например, отчёт руководителю за неделю: выберите период и чьи деньги — ниже итог, а файл Excel можно скачать или отправить себе в Telegram и переслать.</p>
      {sp.sent && <div className="toast-row toast-pop">✓ Отчёт отправлен вам в Telegram — перешлите его оттуда</div>}
      {sp.err && <div className="card hint-warn">{sp.err}</div>}

      <form className="card report-form" action="/report">
        <div className="seg-row" role="group" aria-label="Период">
          {PRESETS.map((p) => (
            <Link key={p.id} href={`/report?${q({ p: p.id })}`} className={`pill-opt ${preset === p.id ? "is-on" : ""}`} replace scroll={false}>
              {p.label}
            </Link>
          ))}
        </div>
        <div className="report-dates">
          <label>
            С
            <input type="date" name="from" defaultValue={from} />
          </label>
          <label>
            По
            <input type="date" name="to" defaultValue={to} />
          </label>
        </div>
        {!simple && (
          <label>
            Чьи деньги
            <select name="scope" defaultValue={key}>
              <option value="">Все деньги</option>
              <optgroup label="Направления">
                {centers.map((c) => (
                  <option key={c.id} value={`c:${c.id}`}>
                    {c.depth ? "— " : ""}
                    {c.name}
                    {potCenters.has(c.id) ? " · касса и направление" : ""}
                  </option>
                ))}
              </optgroup>
              {boxes.length > 0 && (
                <optgroup label="Кассы (наличные)">
                  {boxes.filter((b) => !(b.pot && b.center_id)).map((b) => (
                    <option key={b.id} value={`b:${b.id}`}>
                      {b.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
        )}
        <button className="btn btn-primary">Показать</button>
      </form>

      <section className="report-sum">
        <div className="report-title">
          <strong>{r.scopeName}</strong>
          <span className="muted">{periodTitle(from, to)}</span>
        </div>
        {r.cash && (
          <div className="rs-row">
            <span>Наличные на начало</span>
            <b className="num">{formatMoney(r.cash.start)}</b>
          </div>
        )}
        <div className="rs-row">
          <span>Приходы</span>
          <b className="num pos-text">+{formatMoney(r.income)}</b>
        </div>
        <div className="rs-row">
          <span>Расходы</span>
          <b className="num">−{formatMoney(r.expense)}</b>
        </div>
        <div className="rs-row is-total">
          <span>Итог</span>
          <b className="num">{formatMoney(r.net)}</b>
        </div>
        {r.adjust !== 0 && (
          <div className="rs-row">
            <span>Корректировки остатка</span>
            <b className="num">{r.adjust > 0 ? "+" : "−"}{formatMoney(Math.abs(r.adjust))}</b>
          </div>
        )}
        {r.cash && (
          <div className="rs-row is-total">
            <span>Наличные на конец</span>
            <b className="num">{formatMoney(r.cash.end)}</b>
          </div>
        )}
        {r.cash?.fact && (
          <div className="rs-row is-total">
            <span>
              ✋ На руках по факту
              <small className="muted"> · пересчёт {new Date(r.cash.fact.at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</small>
            </span>
            <b className="num">{formatMoney(r.cash.fact.amount)}</b>
          </div>
        )}
        {r.pending.length > 0 && (
          <>
            <div className="rs-row">
              <span>Ожидают оплаты ({r.pending.length})</span>
              <b className="num">−{formatMoney(r.pending.reduce((a, p) => a + p.left, 0))}</b>
            </div>
            {r.cash && (
              <div className="rs-row">
                <span>После всех оплат</span>
                <b className="num">{formatMoney(r.cash.end - r.pending.reduce((a, p) => a + p.left, 0))}</b>
              </div>
            )}
          </>
        )}
      </section>

      <div className="report-actions">
        <a href={`/report/file?${q({ t: String(Date.now()) })}`} className="btn btn-primary btn-big">
          ⬇ Скачать Excel
        </a>
        {tg.linked ? (
          <form action={sendReportAction}>
            <input type="hidden" name="scope" value={key} />
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            <button className="btn btn-big" style={{ width: "100%" }}>
              ✈ Отправить в Telegram
            </button>
          </form>
        ) : (
          <Link href="/settings" className="btn btn-big">
            ✈ Подключить Telegram, чтобы отправлять
          </Link>
        )}
      </div>

      {tg.linked && (
        <form action={toggleReportAutoAction} className="card row-between report-auto">
          <input type="hidden" name="on" value={auto ? "0" : "1"} />
          <input type="hidden" name="next" value={`/report?${q({})}`} />
          <span>
            <strong>📅 Каждый понедельник — файл в Telegram</strong>
            <span className="muted small">
              {auto ? ` Включено: утром в понедельник бот пришлёт отчёт за прошлую неделю${scope.kind === "all" ? "" : ` по «${r.scopeName}»`}. Останется переслать.` : " Бот сам пришлёт отчёт за прошлую неделю по выбранным «Чьим деньгам» — останется переслать."}
            </span>
          </span>
          <button className={`btn btn-sm ${auto ? "" : "btn-primary"}`}>{auto ? "Выключить" : "Включить"}</button>
        </form>
      )}

      <details className="card report-text">
        <summary>Текст для сообщения — скопировать</summary>
        <pre>{text}</pre>
        <CopyButton text={text} />
      </details>

      {centerNoBox && (
        <form action={createCashboxAction} className="card report-box">
          <input type="hidden" name="centerId" value={scope.kind === "center" ? scope.id : ""} />
          <span>
            <strong>💵 Касса для «{r.scopeName}»</strong>
            <span className="muted small">
              Если у этого направления есть наличные — заведите кассу. Приход и расход по ней попадут в этот отчёт, а наверху появятся остатки на начало и на конец.
            </span>
          </span>
          <div className="grid-2-tight">
            <label>
              Название
              <input name="name" defaultValue={`Касса «${r.scopeName}»`} required />
            </label>
            <label>
              Сейчас в кассе, {curSymbol()}
              <input name="opening" inputMode="decimal" placeholder="0" />
            </label>
          </div>
          <button className="btn btn-primary">Создать кассу</button>
        </form>
      )}

      {r.byCat.length > 0 && (
        <section className="today-sec">
          <div className="today-head">
            <h2>Расходы по категориям</h2>
          </div>
          <div className="card list-card">
            {r.byCat.map((c) => (
              <div key={c.name} className="wallet-row">
                <span className="wallet-main">
                  <strong>{c.name}</strong>
                  <span className="muted small">
                    {c.n} {c.n === 1 ? "операция" : c.n < 5 ? "операции" : "операций"}
                  </span>
                </span>
                <span className="report-bar" aria-hidden>
                  <i style={{ width: `${Math.round((c.s / Math.max(1, r.byCat[0].s)) * 100)}%` }} />
                </span>
                <b className="num wallet-amt">{formatMoney(c.s)}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="today-sec">
        <div className="today-head">
          <h2>Все операции · {r.ops.length}</h2>
        </div>
        {r.ops.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🗓</div>
            <strong>За этот период операций нет</strong>
            <p>Выберите другой период или другие «Чьи деньги».</p>
          </div>
        ) : (
          <div className="card list-card">
            {[...r.ops].reverse().map((o, i) => (
              <div key={i} className="wallet-row report-op">
                <span className="date-chip">
                  <b>{new Date(o.at).getDate()}</b>
                  <span>{new Date(o.at).toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}</span>
                </span>
                <span className="wallet-main">
                  <strong>{o.counterparty || o.note || o.category}</strong>
                  <span className="muted small">{[o.category, o.note && o.note !== o.counterparty ? o.note : "", o.account].filter(Boolean).join(" · ")}</span>
                </span>
                <b className={`num wallet-amt ${o.amount > 0 ? "pos-text" : ""}`}>
                  {o.amount > 0 ? "+" : ""}
                  {formatMoney(o.amount)}
                </b>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
