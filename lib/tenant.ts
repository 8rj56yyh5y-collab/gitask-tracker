import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";

// Несколько аккаунтов на одном сервере: у каждого своя база (свой файл).
// Чей аккаунт сейчас — берётся из входа (cookie) или задаётся явно (вебхуки, фоновые задачи).

export const MAIN = "main";
export const tenantStore = new AsyncLocalStorage<string>();
const requireCjs = createRequire(import.meta.url);

/** Секрет для подписи входа в дополнительные аккаунты. */
export function sessionSecret(): string {
  return process.env.DN_SESSION_SECRET || process.env.DN_APP_PASSWORD || "dev-secret";
}

/** Подпись cookie аккаунта: «acc.<id>.<версия>.<подпись>». Такая же считается в middleware через Web Crypto. */
export function accountCookieValue(id: string, ver: number): string {
  const payload = `acc.${id}.${ver}`;
  return `${payload}.${createHmac("sha256", sessionSecret()).update(payload).digest("hex")}`;
}

/** Разобрать и проверить cookie аккаунта. null — не аккаунт или подпись не сходится. */
export function parseAccountCookie(value: string | undefined | null): { id: string; ver: number } | null {
  const m = /^acc\.([a-z0-9-]{1,40})\.(\d{1,9})\.([0-9a-f]{64})$/.exec(value ?? "");
  if (!m) return null;
  const want = createHmac("sha256", sessionSecret()).update(`acc.${m[1]}.${m[2]}`).digest();
  const got = Buffer.from(m[3], "hex");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  return { id: m[1], ver: Number(m[2]) };
}

/** Аккаунт из cookie текущего запроса (если он есть). */
export function cookieAccount(): { id: string; ver: number } | null {
  try {
    const { cookies } = requireCjs("next/headers") as typeof import("next/headers");
    // Синхронное чтение cookie: getDb() синхронный и вызывается из любых мест.
    const jar = cookies() as unknown as { get(name: string): { value: string } | undefined };
    return parseAccountCookie(jar.get("dn_session")?.value);
  } catch {
    return null; // вне запроса (тесты, фоновые задачи)
  }
}

/** Чей аккаунт сейчас: явно заданный → по входу → основной. */
export function currentTenant(): string {
  const explicit = tenantStore.getStore();
  if (explicit) return explicit;
  return cookieAccount()?.id ?? MAIN;
}

export function runAs<T>(tenant: string, fn: () => T): T {
  return tenantStore.run(tenant, fn);
}
