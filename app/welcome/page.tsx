import Link from "next/link";
import { finishWelcomeAction } from "../actions.ts";

const STEPS = [
  {
    icon: "👋",
    title: "D&N — учёт ваших денег",
    text: "Главная идея простая: каждая трата записана. Вы оплатили — D&N сразу спрашивает, на что ушли деньги. В конце месяца видно, куда всё ушло, и сколько можно отложить.",
    points: ["Записывать — 5 секунд", "Всё видно по месяцам и по дням", "Подсказки от ИИ"],
  },
  {
    icon: "🧭",
    title: "Два вопроса к каждой трате",
    text: "Чтобы потом всё было понятно, у каждой траты два ответа:",
    points: [
      "Направление — чьи это деньги: «Личные», «Семья», «Работа»",
      "Категория — на что именно: 🛒 Продукты, 🚕 Такси, 🏠 Аренда",
      "И короткий комментарий: «продукты на неделю»",
    ],
  },
  {
    icon: "⚡",
    title: "Как записывать",
    text: "Три способа — выберите удобный:",
    points: [
      "Кнопка ＋ внизу — записать вручную",
      "Telegram — после каждой оплаты бот спросит, на что она",
      "Apple Pay — оплаты с телефона попадают сами (настраивается один раз)",
    ],
  },
  {
    icon: "🗺",
    title: "Что где находится",
    text: "Внизу — главные разделы. Всё остальное — в «Ещё».",
    points: [
      "Главная — ваш итог месяца и последние операции",
      "Карты — сколько потрачено с каждой и сколько осталось до лимита",
      "Кассы — наличные: остаток, приход и расход",
      "Платежи — что нужно оплатить и кто должен вам",
    ],
  },
];

export default async function Welcome({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { step: raw } = await searchParams;
  const step = Math.min(Math.max(Number(raw) || 1, 1), STEPS.length);
  const s = STEPS[step - 1];
  const last = step === STEPS.length;
  return (
    <div className="narrow welcome">
      <div className="welcome-dots" aria-label={`Шаг ${step} из ${STEPS.length}`}>
        {STEPS.map((_, i) => (
          <i key={i} className={i + 1 === step ? "is-on" : i + 1 < step ? "is-done" : ""} />
        ))}
      </div>
      <div className="welcome-icon" aria-hidden>
        {s.icon}
      </div>
      <h1>{s.title}</h1>
      <p className="welcome-text">{s.text}</p>
      <ul className="welcome-points">
        {s.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <div className="welcome-actions">
        {last ? (
          <form action={finishWelcomeAction}>
            <input type="hidden" name="next" value="/" />
            <button className="btn btn-primary btn-big">Начать</button>
          </form>
        ) : (
          <Link href={`/welcome?step=${step + 1}`} className="btn btn-primary btn-big" style={{ textAlign: "center" }}>
            Дальше
          </Link>
        )}
        {!last && (
          <form action={finishWelcomeAction}>
            <input type="hidden" name="next" value="/" />
            <button className="btn btn-ghost">Пропустить</button>
          </form>
        )}
        {step > 1 && (
          <Link href={`/welcome?step=${step - 1}`} className="muted small" style={{ textAlign: "center" }}>
            ‹ Назад
          </Link>
        )}
      </div>
    </div>
  );
}
