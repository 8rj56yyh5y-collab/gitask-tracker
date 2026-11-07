import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmount, formatMoney } from "../lib/money.ts";
import { limitState, forecastExhaustDay } from "../lib/limits.ts";
import { parseBankMessage } from "../lib/sms.ts";

test("parseAmount understands common formats", () => {
  assert.equal(parseAmount("₴1 250,50"), 1250.5);
  assert.equal(parseAmount("1,250.50 UAH"), 1250.5);
  assert.equal(parseAmount("250"), 250);
  assert.equal(parseAmount("-300 грн"), 300);
  assert.equal(parseAmount("12.345,67"), 12345.67);
  assert.equal(parseAmount("UAH 99.9"), 99.9);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("abc"), null);
});

test("formatMoney", () => {
  assert.match(formatMoney(-250000), /^−2\s?500 ₴$/);
});

test("limitState colours", () => {
  assert.equal(limitState(5000, 30000).level, "green");
  assert.equal(limitState(13000, 30000).level, "yellow");
  assert.equal(limitState(20000, 30000).level, "orange");
  assert.equal(limitState(30000, 30000).level, "orange");
  assert.equal(limitState(31000, 30000).level, "red");
  assert.equal(limitState(31000, 30000).left, -1000);
});

test("forecastExhaustDay", () => {
  // 10 000 за 5 дней при лимите 30 000 → закончится на 15-й день
  assert.equal(forecastExhaustDay(10000, 30000, new Date(2026, 10, 5)), 15);
  assert.equal(forecastExhaustDay(1000, 30000, new Date(2026, 10, 5)), null);
});

test("parseBankMessage: outgoing card payment", () => {
  const p = parseBankMessage("Oplata 1 250.00 UAH. ATB. Kartka *4521. Zalyshok 10 000.00 UAH");
  assert.ok(p);
  assert.equal(p.amount, 1250);
  assert.equal(p.currency, "UAH");
  assert.equal(p.direction, "out");
  assert.equal(p.cardLast4, "4521");
});

test("parseBankMessage: incoming transfer in Ukrainian", () => {
  const p = parseBankMessage("ПриватБанк: Зарахування 3000,00грн на картку 5168**1234");
  assert.ok(p);
  assert.equal(p.amount, 3000);
  assert.equal(p.direction, "in");
  assert.equal(p.cardLast4, "1234");
  assert.equal(p.bank, "ПриватБанк");
});

test("parseBankMessage: no amount → null", () => {
  assert.equal(parseBankMessage("Ваш код підтвердження 1234"), null);
});
