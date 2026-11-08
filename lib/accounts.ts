import fs from "node:fs";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { closeTenant, getMainDb, tenantFile } from "./db.ts";
import { MAIN, currentTenant, parseAccountCookie, sessionSecret } from "./tenant.ts";

// Дополнительные аккаунты: например, для тех, кто тестирует D&N. У каждого свои данные.

export interface Account {
  id: string;
  name: string;
  login: string;
  ver: number;
  ingest_token: string;
  created_at: string;
}

const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 32).toString("hex");

/** Пароль, который удобно продиктовать или переслать: без похожих букв и цифр. */
export function generatePassword(len = 10): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

const normLogin = (l: string) => l.trim().toLowerCase();

// Пароль шифруется ключом сервера (AES-256-GCM): владелец может снова посмотреть его и переслать,
// а в файле базы он не лежит открытым текстом.
const encKey = () => createHash("sha256").update(`dn-account-pass:${sessionSecret()}`).digest();

function encryptPassword(password: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encKey(), iv);
  const data = Buffer.concat([c.update(password, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

function decryptPassword(enc: string | null | undefined): string | null {
  if (!enc) return null;
  try {
    const [iv, tag, data] = enc.split(".").map((x) => Buffer.from(x, "base64url"));
    const d = createDecipheriv("aes-256-gcm", encKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString("utf8");
  } catch {
    return null; // ключ сервера сменился — пароль надо выдать заново
  }
}

/** Пароль аккаунта, если он сохранён (аккаунты, созданные раньше, — null). */
export function accountPassword(id: string): string | null {
  const r = getMainDb().prepare("SELECT pass_enc FROM accounts WHERE id = ?").get(id) as { pass_enc: string | null } | undefined;
  return decryptPassword(r?.pass_enc);
}

export function listAccounts(): Account[] {
  return getMainDb().prepare("SELECT id, name, login, ver, ingest_token, created_at FROM accounts ORDER BY created_at").all() as unknown as Account[];
}

export function getAccount(id: string): Account | null {
  return (getMainDb().prepare("SELECT id, name, login, ver, ingest_token, created_at FROM accounts WHERE id = ?").get(id) as unknown as Account) ?? null;
}

/** Создать аккаунт. Возвращает его и пароль (пароль больше нигде не хранится — только его хеш). */
export function createAccount(name: string, login: string, password = generatePassword()): { account: Account; password: string } {
  const l = normLogin(login);
  if (!/^[a-z0-9._-]{3,30}$/.test(l)) throw new Error("Логин: 3–30 латинских букв, цифр, точек или дефисов");
  if (l === "owner" || l === MAIN) throw new Error("Этот логин занят");
  if (password.length < 6) throw new Error("Пароль — минимум 6 символов");
  const db = getMainDb();
  if (db.prepare("SELECT 1 FROM accounts WHERE login = ?").get(l)) throw new Error("Такой логин уже есть");
  const id = randomBytes(6).toString("hex");
  const salt = randomBytes(16).toString("hex");
  db.prepare("INSERT INTO accounts (id, name, login, salt, hash, ingest_token, pass_enc) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    id, name.trim().slice(0, 60) || l, l, salt, hashPassword(password, salt), randomBytes(24).toString("base64url"), encryptPassword(password),
  );
  return { account: getAccount(id)!, password };
}

/** Поменять имя и логин. Пароль и вход человека остаются прежними — входить он будет уже с новым логином. */
export function updateAccount(id: string, name: string, login: string) {
  const l = normLogin(login);
  if (!/^[a-z0-9._-]{3,30}$/.test(l)) throw new Error("Логин: 3–30 латинских букв, цифр, точек или дефисов");
  if (l === "owner" || l === MAIN) throw new Error("Этот логин занят");
  const db = getMainDb();
  if (db.prepare("SELECT 1 FROM accounts WHERE login = ? AND id != ?").get(l, id)) throw new Error("Такой логин уже есть");
  const n = name.trim().slice(0, 60) || l;
  db.prepare("UPDATE accounts SET name = ?, login = ? WHERE id = ?").run(n, l, id);
}

/** Проверить логин и пароль. */
export function checkLogin(login: string, password: string): Account | null {
  const row = getMainDb().prepare("SELECT * FROM accounts WHERE login = ?").get(normLogin(login)) as
    | (Account & { salt: string; hash: string })
    | undefined;
  if (!row) return null;
  const want = Buffer.from(row.hash, "hex");
  const got = Buffer.from(hashPassword(password, row.salt), "hex");
  return want.length === got.length && timingSafeEqual(want, got) ? getAccount(row.id) : null;
}

/** Новый пароль. Старые входы этого аккаунта перестают работать. */
export function resetPassword(id: string): string {
  const password = generatePassword();
  const salt = randomBytes(16).toString("hex");
  getMainDb()
    .prepare("UPDATE accounts SET salt = ?, hash = ?, pass_enc = ?, ver = ver + 1 WHERE id = ?")
    .run(salt, hashPassword(password, salt), encryptPassword(password), id);
  return password;
}

/** Удалить аккаунт вместе с его данными. */
export function deleteAccount(id: string) {
  closeTenant(id);
  getMainDb().prepare("DELETE FROM accounts WHERE id = ?").run(id);
  const file = tenantFile(id);
  if (file !== ":memory:") for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
}

/** Чей ключ для «Команд» / Monobank пришёл: основной (из настроек сервера) или аккаунта. */
export function tenantForKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const variants = [key, key.replace(/ /g, "+")];
  const main = process.env.DN_INGEST_TOKEN;
  const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  if (main && main.length >= 16 && variants.some((v) => same(v, main))) return MAIN;
  for (const a of listAccounts()) if (variants.some((v) => same(v, a.ingest_token))) return a.id;
  return null;
}

/** Ключ для «Команд» и Monobank текущего аккаунта. */
export function currentIngestKey(): string {
  const t = currentTenant();
  if (t === MAIN) return process.env.DN_INGEST_TOKEN ?? "";
  return getAccount(t)?.ingest_token ?? "";
}

/** Вход в дополнительный аккаунт ещё действителен (аккаунт не удалён, пароль не сбрасывали). */
export function accountSessionOk(cookie: string | undefined): boolean {
  const parsed = parseAccountCookie(cookie);
  if (!parsed) return true; // это не вход в дополнительный аккаунт
  const a = getAccount(parsed.id);
  return Boolean(a && a.ver === parsed.ver);
}

export function isOwner(): boolean {
  return currentTenant() === MAIN;
}

export function currentAccountName(): string | null {
  const t = currentTenant();
  return t === MAIN ? null : (getAccount(t)?.name ?? null);
}
