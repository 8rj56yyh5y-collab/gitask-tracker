// Простая защита интерфейса паролем (до полноценных пользователей на этапе 2).
// В cookie хранится HMAC от пароля, сам пароль никуда не пишется.
// Работает и в Node, и в middleware (Web Crypto).

export const SESSION_COOKIE = "dn_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 дней

export function appPassword(): string | null {
  const p = process.env.DN_APP_PASSWORD;
  return p && p.length >= 6 ? p : null;
}

export async function sessionToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("dn-session-v1"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, text: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Вход в дополнительный аккаунт: «acc.<id>.<версия>.<подпись>» (подпись — как в lib/tenant.ts). */
async function accountCookieValid(cookie: string): Promise<boolean> {
  const m = /^(acc\.[a-z0-9-]{1,40}\.\d{1,9})\.([0-9a-f]{64})$/.exec(cookie);
  if (!m) return false;
  const secret = process.env.DN_SESSION_SECRET || process.env.DN_APP_PASSWORD || "dev-secret";
  return safeEqual(m[2], await hmacHex(secret, m[1]));
}

/** true — пустить; false — на страницу входа. Без пароля пускаем только в режиме разработки. */
export async function sessionValid(cookie: string | undefined): Promise<boolean> {
  const password = appPassword();
  if (!password) return process.env.NODE_ENV !== "production";
  if (!cookie) return false;
  if (cookie.startsWith("acc.")) return accountCookieValid(cookie);
  return safeEqual(cookie, await sessionToken(password));
}
