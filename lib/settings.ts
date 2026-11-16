import { getDb } from "./db.ts";
import { setCurrencyResolver } from "./money.ts";
import { currentTenant } from "./tenant.ts";

// Настройки, которые задаются из интерфейса (Telegram и т.п.).

export function getSetting(key: string): string | null {
  const r = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

export function setSetting(key: string, value: string | null) {
  if (value === null) getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
  else getDb().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

// Валюта аккаунта для formatMoney: читаем из настроек, держим в памяти 5 секунд, чтобы не ходить в базу на каждую сумму.
const curCache = new Map<string, { v: string | null; at: number }>();
setCurrencyResolver(() => {
  const t = currentTenant();
  const hit = curCache.get(t);
  if (hit && Date.now() - hit.at < 5000) return hit.v;
  const v = getSetting("currency");
  curCache.set(t, { v, at: Date.now() });
  return v;
});

/** Сменить валюту аккаунта (сбрасывает кеш, чтобы новая валюта показалась сразу). */
export function setCurrency(code: string) {
  setSetting("currency", code === "UAH" ? null : code);
  curCache.clear();
}
