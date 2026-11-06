import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionToken, sessionValid, SESSION_COOKIE } from "../lib/session.ts";

test("session cookie is valid only for the configured password", async () => {
  process.env.DN_APP_PASSWORD = "secret-pass";
  const good = await sessionToken("secret-pass");
  assert.equal(await sessionValid(good), true);
  assert.equal(await sessionValid(await sessionToken("other-pass")), false);
  assert.equal(await sessionValid(undefined), false);
  assert.ok(SESSION_COOKIE);
});

test("without a password access is closed in production", async () => {
  delete process.env.DN_APP_PASSWORD;
  const env = process.env as Record<string, string | undefined>;
  const prev = env.NODE_ENV;
  env.NODE_ENV = "production";
  assert.equal(await sessionValid(undefined), false);
  env.NODE_ENV = prev;
});
