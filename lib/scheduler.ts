// Фоновые задачи сервера: зачисление ставок и напоминания в Telegram. Запускается один раз при старте.
import { creditDueSalaries } from "./income.ts";
import { sendPlanReminders } from "./telegram.ts";
import { listAccounts } from "./accounts.ts";
import { MAIN, runAs } from "./tenant.ts";

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;
  // Для каждого аккаунта — в его базе.
  const tick = () => {
    let tenants: string[] = [MAIN];
    try {
      tenants = [MAIN, ...listAccounts().map((a) => a.id)];
    } catch (e) {
      console.error("Scheduler (accounts):", e);
    }
    for (const t of tenants) {
      runAs(t, () => {
        try {
          creditDueSalaries();
        } catch (e) {
          console.error(`Scheduler (income, ${t}):`, e);
        }
        sendPlanReminders().catch((e) => console.error(`Scheduler (${t}):`, e));
      });
    }
  };
  setTimeout(tick, 60_000); // через минуту после старта
  setInterval(tick, 30 * 60_000); // и каждые полчаса
}
