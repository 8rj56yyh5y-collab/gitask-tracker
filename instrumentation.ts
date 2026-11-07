// Все даты (границы месяца, лимиты, время операций) считаем по Киеву,
// даже если сервер работает в UTC. Можно поменять через DN_TZ.
export async function register() {
  process.env.TZ = process.env.DN_TZ || "Europe/Kyiv";
  // Напоминания о платежах — только на сервере Node, не в middleware.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler.ts");
    startScheduler();
  }
}
