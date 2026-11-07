import { getDb } from "./db.ts";

// Настройки, которые задаются из интерфейса (Telegram и т.п.).

export function getSetting(key: string): string | null {
  const r = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

export function setSetting(key: string, value: string | null) {
  if (value === null) getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
  else getDb().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
