"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { askAction } from "../actions.ts";

type Turn = { role: "user" | "assistant"; text: string; error?: boolean };

const IDEAS = [
  "Сколько я потратил на кафе в этом месяце?",
  "Где я могу сэкономить?",
  "Сравни этот месяц с прошлым",
  "Какие у меня регулярные платежи и подписки?",
  "На что я трачу больше всего в выходные?",
  "Хватит ли мне денег до конца месяца?",
];

const KEY = "dn_chat";

/** Чат с помощником: история хранится только на этом устройстве, пока открыта вкладка. */
export function Chat({ ready }: { ready: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY);
      if (saved) setTurns(JSON.parse(saved));
    } catch {
      /* без хранилища — просто с чистого листа */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(turns.slice(-30)));
    } catch {
      /* ничего */
    }
    // Прокручиваем к ответу только когда разговор уже идёт — пустая страница остаётся наверху.
    if (turns.length || pending) end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, pending]);

  const send = (text: string) => {
    const question = text.trim();
    if (!question || pending) return;
    const history = turns.filter((t) => !t.error).map(({ role, text }) => ({ role, text }));
    setTurns((t) => [...t, { role: "user", text: question }]);
    setQ("");
    start(async () => {
      const r = await askAction(history, question);
      setTurns((t) => [...t, r.answer ? { role: "assistant", text: r.answer } : { role: "assistant", text: r.error ?? "Не получилось ответить.", error: true }]);
    });
  };

  return (
    <div className="chat">
      {turns.length === 0 && (
        <div className="chat-hello">
          <div className="chat-orb" aria-hidden>
            ✨
          </div>
          <strong>Спросите что угодно о своих деньгах</strong>
          <span className="muted small">Помощник видит ваши траты, доходы, платежи, копилки и лимиты за последние полгода и считает по ним.</span>
          {!ready && <span className="chat-warn">ИИ пока не подключён на сервере — ответы появятся, когда будет задан ключ ИИ (см. «Настройки»).</span>}
          <div className="chat-ideas">
            {IDEAS.map((i) => (
              <button key={i} type="button" className="chat-idea" onClick={() => send(i)} disabled={pending}>
                {i}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="chat-list" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className={`msg ${t.role === "user" ? "is-me" : "is-ai"} ${t.error ? "is-err" : ""}`}>
            {t.text}
          </div>
        ))}
        {pending && (
          <div className="msg is-ai is-typing" aria-label="Помощник думает">
            <i />
            <i />
            <i />
          </div>
        )}
        <div ref={end} />
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(q);
        }}
      >
        <input id="ask-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Например: сколько ушло на такси за 3 месяца?" aria-label="Вопрос помощнику" maxLength={1000} autoComplete="off" />
        <button className="chat-send" disabled={pending || !q.trim()} aria-label="Спросить">
          ↑
        </button>
      </form>
      {turns.length > 0 && (
        <button type="button" className="btn btn-ghost btn-sm chat-clear" onClick={() => setTurns([])}>
          Начать заново
        </button>
      )}
    </div>
  );
}
