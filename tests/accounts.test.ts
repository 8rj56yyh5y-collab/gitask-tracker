import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "dn-acc-"));
process.env.DN_DB_PATH = join(dir, "dn.db");
process.env.DN_INGEST_TOKEN = "main-ingest-token-123456";
process.env.DN_APP_PASSWORD = "owner-pass";
const repo = await import("../lib/repo.ts");
const accounts = await import("../lib/accounts.ts");
const tenant = await import("../lib/tenant.ts");
const { tenantFile } = await import("../lib/db.ts");

test("аккаунт: свой вход, свои данные, владелец их не видит и наоборот", () => {
  const { account, password } = accounts.createAccount("Олег", "Oleg");
  assert.equal(account.login, "oleg");
  assert.ok(password.length >= 8);
  assert.throws(() => accounts.createAccount("Ещё", "oleg"), /уже есть/);
  assert.throws(() => accounts.createAccount("Плохой", "ab"), /Логин/);
  assert.equal(accounts.checkLogin("OLEG", password)!.id, account.id);
  assert.equal(accounts.checkLogin("oleg", "wrong-pass"), null);

  const mine = repo.insertTx({ amountKop: -100_00, source: "manual", counterparty: "Моя покупка" }).id;
  tenant.runAs(account.id, () => {
    assert.ok(!repo.listRecent(50).some((t) => t.counterparty === "Моя покупка"), "чужие операции не видны");
    repo.insertTx({ amountKop: -5_00, source: "manual", counterparty: "Покупка Олега" });
    const names = repo.listCenters().map((c) => c.name);
    assert.ok(names.includes("Личные") && names.includes("Семья"), "у нового аккаунта общие направления");
    assert.ok(!names.includes("Приёмные пункты (заготовка)"));
  });
  assert.ok(!repo.listRecent(50).some((t) => t.counterparty === "Покупка Олега"));
  assert.ok(repo.getTx(mine));
  assert.ok(existsSync(tenantFile(account.id)), "у аккаунта отдельный файл базы");
});

test("ключ «Команд»: свой у каждого аккаунта; вход по cookie подписан", () => {
  const acc = accounts.listAccounts()[0];
  assert.equal(accounts.tenantForKey("main-ingest-token-123456"), tenant.MAIN);
  assert.equal(accounts.tenantForKey(acc.ingest_token), acc.id);
  assert.equal(accounts.tenantForKey("nope"), null);
  const cookie = tenant.accountCookieValue(acc.id, acc.ver);
  assert.deepEqual(tenant.parseAccountCookie(cookie), { id: acc.id, ver: acc.ver });
  assert.equal(tenant.parseAccountCookie(cookie.replace(/.$/, (c) => (c === "0" ? "1" : "0"))), null, "подделка не проходит");
  assert.equal(tenant.parseAccountCookie(`acc.${acc.id}.1.${"0".repeat(64)}`), null);
  assert.ok(accounts.accountSessionOk(cookie));
});

test("новый пароль отменяет старый вход; удаление убирает данные", () => {
  const acc = accounts.listAccounts()[0];
  const oldCookie = tenant.accountCookieValue(acc.id, acc.ver);
  const fresh = accounts.resetPassword(acc.id);
  assert.equal(accounts.accountSessionOk(oldCookie), false);
  assert.ok(accounts.checkLogin("oleg", fresh));
  const file = tenantFile(acc.id);
  accounts.deleteAccount(acc.id);
  assert.equal(accounts.getAccount(acc.id), null);
  assert.equal(existsSync(file), false);
  assert.throws(() => tenant.runAs(acc.id, () => repo.listRecent(1)), /не найден/);
});

test("имя и логин можно поменять; пароль и вход остаются", () => {
  const { account, password } = accounts.createAccount("Анна", "anna");
  const cookie = tenant.accountCookieValue(account.id, account.ver);
  accounts.updateAccount(account.id, "Анна К.", "Anna.K");
  const a = accounts.getAccount(account.id)!;
  assert.equal(a.name, "Анна К.");
  assert.equal(a.login, "anna.k");
  assert.ok(accounts.checkLogin("anna.k", password));
  assert.equal(accounts.checkLogin("anna", password), null);
  assert.ok(accounts.accountSessionOk(cookie), "уже вошедший остаётся в аккаунте");
  accounts.createAccount("Борис", "boris");
  assert.throws(() => accounts.updateAccount(account.id, "Анна", "boris"), /уже есть/);
  assert.throws(() => accounts.updateAccount(account.id, "Анна", "a"), /Логин/);
});

test("данные для входа можно посмотреть снова; новый пароль тоже виден", () => {
  const { account, password } = accounts.createAccount("Вика", "vika");
  assert.equal(accounts.accountPassword(account.id), password);
  const fresh = accounts.resetPassword(account.id);
  assert.notEqual(fresh, password);
  assert.equal(accounts.accountPassword(account.id), fresh);
  // в базе пароль не лежит открытым текстом
  const raw = JSON.stringify(accounts.listAccounts());
  assert.ok(!raw.includes(fresh));
});
