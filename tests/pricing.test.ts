import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTiers, parseTiers, priceFor, splitSale } from "../lib/pricing.ts";

test("tiers: parse and format", () => {
  assert.deepEqual(parseTiers("1=450; 3=1200"), [{ qty: 1, price: 45000 }, { qty: 3, price: 120000 }]);
  assert.deepEqual(parseTiers("1 уп: 449,50\n3=1 200 грн"), [{ qty: 1, price: 44950 }, { qty: 3, price: 120000 }]);
  assert.deepEqual(parseTiers("ерунда"), []);
  assert.equal(formatTiers(parseTiers("3=1200;1=450")), "1=450; 3=1200");
});

test("price picks the cheapest combination of packs", () => {
  const t = parseTiers("1=450; 3=1200");
  assert.equal(priceFor(1, t)!.total, 45000);
  assert.equal(priceFor(3, t)!.total, 120000, "3 packs as a set, not 3 × 450");
  assert.equal(priceFor(4, t)!.total, 165000, "set of 3 + 1 single");
  assert.equal(priceFor(6, t)!.total, 240000);
  assert.deepEqual(priceFor(7, t)!.parts, [{ qty: 3, price: 120000, count: 2 }, { qty: 1, price: 45000, count: 1 }]);
  assert.equal(priceFor(0, t), null);
  // без набора на 1 штуку — по цене за штуку самого маленького набора
  assert.equal(priceFor(2, parseTiers("3=1200"))!.total, 80000);
});

test("sale split: marketplace, sales commission, company share", () => {
  // 450 ₴, 7.5% отделу, вживую
  assert.deepEqual(splitSale(45000, 7.5, 5, "direct"), { mpFee: 0, commission: 3375, company: 41625 });
  // через маркетплейс 5%, комиссия от суммы продажи
  assert.deepEqual(splitSale(120000, 7.5, 5, "mp"), { mpFee: 6000, commission: 9000, company: 105000 });
  // комиссия от суммы после маркетплейса
  assert.deepEqual(splitSale(120000, 7.5, 5, "mp", "net"), { mpFee: 6000, commission: 8550, company: 105450 });
});
