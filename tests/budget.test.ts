import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetStatus, dailyAllowance, forecastMonth } from "../lib/budget.ts";

test("forecast: your example — 10 000 ₴ on fuel by the 3rd", () => {
  const f = forecastMonth(10_000_00, new Date(2026, 10, 3)); // ноябрь, 30 дней
  assert.equal(f.forecast, 100_000_00);
  assert.equal(f.early, true);
  assert.equal(budgetStatus(10_000_00, 25_000_00, f.forecast), "pace");
});

test("forecast is rounded to whole hryvnias and not early after the 5th", () => {
  const f = forecastMonth(1_880_00, new Date(2026, 10, 7));
  assert.equal(f.forecast % 100, 0);
  assert.equal(f.early, false);
});

test("budget statuses", () => {
  assert.equal(budgetStatus(5_000_00, 0, 50_000_00), "none");
  assert.equal(budgetStatus(5_000_00, 25_000_00, 20_000_00), "ok");
  assert.equal(budgetStatus(5_000_00, 25_000_00, 30_000_00), "pace");
  assert.equal(budgetStatus(26_000_00, 25_000_00, 30_000_00), "over");
});

test("daily allowance to stay within the limit", () => {
  // 30 ноября: остался 1 день, 5 000 ₴ запаса
  assert.equal(dailyAllowance(20_000_00, 25_000_00, new Date(2026, 10, 30)), 5_000_00);
  assert.equal(dailyAllowance(30_000_00, 25_000_00, new Date(2026, 10, 10)), 0);
});
