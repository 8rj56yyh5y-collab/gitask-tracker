"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { quickAddAction, quickPreviewAction } from "../actions.ts";
import { spokenToText } from "@/lib/spoken.ts";

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

type Rec = { lang: string; interimResults: boolean; maxAlternatives: number; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

/** Кнопка микрофона: говорите «кофе семьдесят пять» — строка заполнится сама. Есть не во всех браузерах. */
function Mic({ onText }: { onText: (t: string) => void }) {
  const [ok, setOk] = useState(false);
  const [on, setOn] = useState(false);
  const rec = useRef<Rec | null>(null);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    setOk(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  if (!ok) return null;
  const toggle = () => {
    if (on) {
      rec.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const R = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!R) return;
    const r = new R();
    r.lang = "ru-RU";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript ?? "";
      if (t) onText(spokenToText(t));
    };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    setOn(true);
    try {
      r.start();
    } catch {
      setOn(false);
    }
  };
  return (
    <button type="button" className={`ql-mic ${on ? "is-on" : ""}`} onClick={toggle} aria-label={on ? "Остановить запись голоса" : "Сказать голосом"} title="Сказать голосом: «кофе семьдесят пять»">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
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
        {q ? <Go ok={ready} /> : <Mic onText={setQ} />}
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
