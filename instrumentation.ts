// Все даты (границы месяца, лимиты, время операций) считаем по Киеву,
// даже если сервер работает в UTC. Можно поменять через DN_TZ.
export function register() {
  process.env.TZ = process.env.DN_TZ || "Europe/Kyiv";
}
