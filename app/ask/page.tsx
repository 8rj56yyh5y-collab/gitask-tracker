import { aiConfigured } from "@/lib/ai.ts";
import { Chat } from "./Chat.tsx";

/** ИИ-помощник: вопросы о своих деньгах обычными словами. */
export default function Ask() {
  return (
    <div className="narrow">
      <h1>Помощник</h1>
      <Chat ready={aiConfigured()} />
      <p className="muted small chat-privacy">В ИИ уходят ваши операции за полгода (дата, сумма, магазин, категория, комментарий) — без номеров карт. Ничего не сохраняется у ИИ после ответа.</p>
    </div>
  );
}
