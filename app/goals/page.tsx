import Link from "next/link";
import { archiveGoalAction, createGoalAction, goalMoveAction } from "../actions.ts";
import { goalMoves, listGoals } from "@/lib/goals.ts";
import { formatMoney } from "@/lib/money.ts";
import { SubmitButton } from "../components/SubmitButton.tsx";

const EMOJI = ["🎯", "✈️", "🚗", "🏠", "💻", "📱", "🎓", "💍", "🛡️", "🎁"];

export default async function Goals({ searchParams }: { searchParams: Promise<{ new?: string; open?: string }> }) {
  const sp = await searchParams;
  const goals = listGoals();
  const total = goals.reduce((a, g) => a + g.saved, 0);
  const openId = Number(sp.open) || null;
  const showNew = sp.new === "1" || goals.length === 0;

  return (
    <div className="narrow-wide">
      <div className="page-head">
        <h1>Копилки</h1>
        {!showNew && (
          <Link href="/goals?new=1#new" className="btn btn-primary btn-sm">
            + Копилка
          </Link>
        )}
      </div>
      <p className="page-hint">Откладывайте на цель: отпуск, ремонт, подушку безопасности. D&amp;N покажет, сколько собрано и сколько нужно откладывать в месяц, чтобы успеть.</p>

      {goals.length > 0 && (
        <section className="summary-hero">
          <div className="summary-label">Отложено во всех копилках</div>
          <div className="summary-value num">{formatMoney(total)}</div>
        </section>
      )}

      <div className="goal-list">
        {goals.map((g) => (
          <article key={g.id} className={`card goal ${g.done ? "is-done" : ""}`} id={`g${g.id}`}>
            <div className="goal-top">
              <span className="goal-emoji" aria-hidden>
                {g.emoji}
              </span>
              <span className="goal-name">
                <strong>{g.name}</strong>
                <span className="muted small">
                  {g.done
                    ? "Собрано! 🎉"
                    : g.perMonth
                      ? `≈ ${formatMoney(g.perMonth)} в месяц, чтобы успеть к ${g.deadline!.split("-").reverse().join(".")}`
                      : `осталось ${formatMoney(g.left)}`}
                </span>
              </span>
              <span className="goal-pct num">{g.pct}%</span>
            </div>
            <div className="goal-track" role="progressbar" aria-valuenow={g.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Собрано ${g.pct}%`}>
              <i style={{ width: `${g.pct}%` }} />
            </div>
            <div className="row-between small">
              <span>
                <b>{formatMoney(g.saved)}</b> из {formatMoney(g.target)}
              </span>
              <Link href={openId === g.id ? "/goals" : `/goals?open=${g.id}#g${g.id}`} className="link" scroll={false}>
                {openId === g.id ? "Свернуть" : "Пополнить или взять"}
              </Link>
            </div>
            {openId === g.id && (
              <div className="goal-more">
                <form action={goalMoveAction} className="goal-move">
                  <input type="hidden" name="id" value={g.id} />
                  <input type="hidden" name="next" value={`/goals?open=${g.id}`} />
                  <input name="amount" inputMode="decimal" placeholder="Сумма, ₴" required aria-label="Сумма" />
                  <SubmitButton className="btn btn-primary" name="dir" value="add">
                    + Отложить
                  </SubmitButton>
                  <SubmitButton className="btn" name="dir" value="take">
                    − Взять
                  </SubmitButton>
                </form>
                {goalMoves(g.id).length > 0 && (
                  <ul className="goal-moves">
                    {goalMoves(g.id).map((m) => (
                      <li key={m.id} className="row-between small">
                        <span className="muted">
                          {new Date(m.at.replace(" ", "T") + (m.at.includes("Z") ? "" : "Z")).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                          {m.note ? ` · ${m.note}` : ""}
                        </span>
                        <b className={m.amount > 0 ? "pos-text" : ""}>
                          {m.amount > 0 ? "+" : "−"}
                          {formatMoney(Math.abs(m.amount))}
                        </b>
                      </li>
                    ))}
                  </ul>
                )}
                <form action={archiveGoalAction}>
                  <input type="hidden" name="id" value={g.id} />
                  <button className="btn btn-ghost btn-sm">{g.done ? "Убрать — цель достигнута" : "Убрать копилку"}</button>
                </form>
              </div>
            )}
          </article>
        ))}
      </div>

      {showNew && (
        <form action={createGoalAction} className="card form" id="new">
          <h2>Новая копилка</h2>
          <fieldset className="chips-field">
            <legend>Значок</legend>
            <div className="chips">
              {EMOJI.map((e, i) => (
                <label key={e} className="chip-opt emoji-opt">
                  <input type="radio" name="emoji" value={e} defaultChecked={i === 0} />
                  <span>{e}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            На что копим
            <input name="name" required placeholder="например, отпуск летом" maxLength={60} />
          </label>
          <div className="grid-2-tight">
            <label>
              Сколько нужно, ₴
              <input name="target" inputMode="decimal" required placeholder="50 000" />
            </label>
            <label>
              К какому сроку
              <input name="deadline" type="date" />
            </label>
          </div>
          <label>
            Уже есть, ₴ (если начали раньше)
            <input name="start" inputMode="decimal" placeholder="0" />
          </label>
          <SubmitButton className="btn btn-primary btn-big">Создать копилку</SubmitButton>
          <p className="muted small" style={{ margin: 0 }}>
            Копилка — это учёт, деньги никуда не переводятся. Отложили наличными или на отдельную карту — отметьте здесь «+ Отложить».
          </p>
        </form>
      )}
    </div>
  );
}
