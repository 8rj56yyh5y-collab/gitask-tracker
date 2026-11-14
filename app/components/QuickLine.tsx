"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { quickAddAction, quickPreviewAction } from "../actions.ts";

type Preview = Awaited<ReturnType<typeof quickPreviewAction>>;

const money = (kop: number) => `${(kop / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₴`;

function Go({ ok }: { ok: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={`ql-go ${ok ? "is-ready" : ""}`} disabled={pending} aria-label="Записать">
      {pending ? "…" : "↵"}
    </button>
  );
}

/**
 * Запись одной строкой: «кофе 75», «такси 146», «обед 230». Пока человек печатает,
 * под строкой видно, что поймёт D&N: сумму, категорию и чьи деньги.
 */
export function QuickLine({ next = "/" }: { next?: string }) {
  const [q, setQ] = useState("");
  const [p, setP] = useState<Preview | null>(null);
  const [, start] = useTransition();
  const seq = useRef(0);
  useEffect(() => {
    if (!q.trim()) {
      setP(null);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(() => start(async () => {
      const r = await quickPreviewAction(q);
      if (n === seq.current) setP(r);
    }), 180);
    return () => clearTimeout(t);
  }, [q]);
  const ready = Boolean(p && p.amount && p.category && p.note);
  return (
    <form action={quickAddAction} className={`quickline ${q ? "is-typing" : ""}`}>
      <input type="hidden" name="next" value={next} />
      <div className="ql-row">
        <span className="ql-plus" aria-hidden>
          ＋
        </span>
        <input
          id="quick-q"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Записать: «кофе 75», «такси 146»"
          aria-label="Записать трату одной строкой"
          autoComplete="off"
          enterKeyHint="done"
          maxLength={120}
        />
        {q && <Go ok={ready} />}
      </div>
      {p && (
        <div className="ql-preview" aria-live="polite">
          {p.amount ? <b className="ql-chip">{money(p.amount)}</b> : <span className="ql-chip is-miss">сумма?</span>}
          {p.category ? (
            <span className="ql-chip">
              {p.category.emoji} {p.category.name}
              {p.how === "history" ? " · как в прошлый раз" : ""}
            </span>
          ) : (
            <span className="ql-chip is-miss">категорию уточним</span>
          )}
          {p.centerName && <span className="ql-chip is-quiet">{p.centerName}</span>}
          {!p.note && <span className="ql-chip is-miss">на что?</span>}
        </div>
      )}
    </form>
  );
}
