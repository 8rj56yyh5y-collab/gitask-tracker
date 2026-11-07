// Фоновые задачи сервера: напоминания о платежах в Telegram. Запускается один раз при старте.
import { sendPlanReminders } from "./telegram.ts";

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;
  const tick = () => sendPlanReminders().catch((e) => console.error("Scheduler:", e));
  setTimeout(tick, 60_000); // через минуту после старта
  setInterval(tick, 30 * 60_000); // и каждые полчаса
}
