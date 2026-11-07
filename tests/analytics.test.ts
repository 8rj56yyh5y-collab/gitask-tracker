import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DN_DB_PATH = ":memory:";
process.env.TZ = "Europe/Kyiv";
delete process.env.ANTHROPIC_API_KEY;
const repo = await import("../lib/repo.ts");
const ai = await import("../lib/ai.ts");
const center = (name: string) => repo.listCenters().find((c) => c.name.startsWith(name))!.id;

const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();
repo.insertTx({ amountKop: -10_000_00, source: "manual", costCenterId: center("Отдел продаж"), occurredAt: at(2026, 9, 10) });
repo.insertTx({ amountKop: -4_000_00, source: "manual", costCenterId: center("Личные"), occurredAt: at(2026, 9, 12) });
repo.insertTx({ amountKop: -15_000_00, source: "manual", costCenterId: center("Отдел продаж"), occurredAt: at(2026, 10, 3) });
repo.insertTx({ amountKop: 50_000_00, source: "manual", occurredAt: at(2026, 10, 4) });
// внутренние переводы не считаются расходом
repo.insertTx({ amountKop: -9_000_00, source: "manual", costCenterId: center("Внутренние"), occurredAt: at(2026, 10, 5) });

test("past months stay available: monthly totals for a year", () => {
  const t = repo.monthlyTotals(12, new Date(2026, 10, 20));
  assert.equal(t.length, 12);
  assert.equal(t.at(-1)!.key, "2026-11");
  assert.equal(t.at(-1)!.expense, 15_000_00);
  assert.equal(t.at(-1)!.income, 50_000_00);
  assert.equal(t.at(-2)!.expense, 14_000_00);
  assert.equal(t[0].key, "2025-12");
});

test("month comparison by category", () => {
  const c = repo.compareWithPrevMonth(new Date(2026, 10, 20));
  const sales = c.find((x) => x.id === center("Отдел продаж"))!;
  assert.deepEqual([sales.current, sales.previous, sales.changePct], [15_000_00, 10_000_00, 50]);
  const personal = c.find((x) => x.id === center("Личные"))!;
  assert.equal(personal.changePct, -100);
  assert.ok(!c.some((x) => x.name.startsWith("Внутренние")));
});

test("month keys: past month resolves to its last day, future clamps to now", () => {
  const now = new Date(2026, 10, 7, 12);
  assert.equal(repo.monthDate("2026-10", now).getDate(), 31);
  assert.equal(repo.monthKey(repo.monthDate("2030-01", now)), "2026-11");
  assert.equal(repo.monthKey(repo.monthDate("bad", now)), "2026-11");
});

test("AI summary carries only aggregates; AI is off without a key", async () => {
  const s = ai.buildMonthSummary(new Date(2026, 9, 31, 12));
  const json = JSON.stringify(s);
  assert.equal(s.месяц, "2026-10");
  assert.ok(!/\d{4}\*/.test(json), "no card numbers");
  assert.equal(ai.aiConfigured(), false);
  await assert.rejects(ai.analyzeMonth(new Date()), /не подключён/);
});
