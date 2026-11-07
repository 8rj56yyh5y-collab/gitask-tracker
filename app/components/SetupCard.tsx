import Link from "next/link";
import { toggleSetupAction } from "../actions.ts";
import { setupHidden, setupSteps } from "@/lib/setup.ts";

/** «С чего начать» на главной: пока всё обязательное не сделано. */
export function SetupCard() {
  const steps = setupSteps();
  const required = steps.filter((s) => !s.optional);
  const doneCount = required.filter((s) => s.done).length;
  if (doneCount === required.length || setupHidden()) return null;
  const next = steps.find((s) => !s.done && !s.optional) ?? steps.find((s) => !s.done);
  return (
    <section className="card span-all setup-card">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>С чего начать</h2>
        <span className="muted small">
          {doneCount} из {required.length}
        </span>
      </div>
      <div className="limit-track">
        <div className="limit-fill" style={{ width: `${(doneCount / required.length) * 100}%`, background: "var(--green)" }} />
      </div>
      <ol className="setup-steps">
        {steps.map((s) => (
          <li key={s.id} className={`${s.done ? "is-done" : ""} ${s.id === next?.id ? "is-next" : ""}`}>
            <Link href={s.href} className="plain setup-step">
              <span className="setup-mark" aria-hidden>{s.done ? "✓" : ""}</span>
              <span>
                <strong>{s.title}</strong>
                {!s.done && <span className="muted small setup-why">{s.why}</span>}
              </span>
              {!s.done && <span className="setup-go">›</span>}
            </Link>
          </li>
        ))}
      </ol>
      <div className="row-between">
        <Link href="/help" className="link small">Как пользоваться D&amp;N</Link>
        <form action={toggleSetupAction}>
          <input type="hidden" name="hide" value="1" />
          <input type="hidden" name="next" value="/" />
          <button className="btn btn-ghost btn-sm">Скрыть</button>
        </form>
      </div>
    </section>
  );
}
