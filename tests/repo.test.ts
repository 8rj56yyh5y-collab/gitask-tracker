import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DN_DB_PATH = ":memory:";
process.env.TZ = "Europe/Kyiv";
const repo = await import("../lib/repo.ts");

const center = (name: string) => repo.listCenters().find((c) => c.name === name)!;

test("default cost centers are created", () => {
  assert.ok(center("Отдел продаж"));
  assert.equal(center("Внутренние переводы").is_internal, 1);
});

test("new transaction without center lands in the inbox", () => {
  const { id } = repo.insertTx({ amountKop: -125000, source: "applepay", counterparty: "OKKO" });
  assert.ok(repo.listUnassigned().some((t) => t.id === id));
  repo.assignTx(id, center("Отдел продаж").id, "руководитель");
  assert.ok(!repo.listUnassigned().some((t) => t.id === id));
  assert.equal(repo.getTx(id)!.for_whom, "руководитель");
});

test("manual entry straight into internal transfers is not an expense", () => {
  const { id } = repo.insertTx({ amountKop: -500000, source: "manual", costCenterId: center("Внутренние переводы").id });
  assert.equal(repo.getTx(id)!.kind, "internal");
  assert.ok(!repo.monthSpendByCenter().some((s) => s.name.startsWith("Внутренние")));
});

test("spend of a hidden cost center stays in the report", () => {
  repo.createCenter("Пункт Житомир", center("Приёмные пункты (заготовка)").id, "#000000", 0, false);
  const child = center("Пункт Житомир");
  repo.insertTx({ amountKop: -300000, source: "manual", costCenterId: child.id });
  repo.archiveCenter(child.id);
  const root = repo.monthSpendByCenter().find((s) => s.name.startsWith("Приёмные пункты"));
  assert.equal(root?.spent, 300000);
});

test("identical external ids are deduplicated, missing ids are not", () => {
  const a = repo.insertTx({ amountKop: -500000, source: "monobank", externalId: "mono:x1" });
  const b = repo.insertTx({ amountKop: -500000, source: "monobank", externalId: "mono:x1" });
  assert.equal(b.duplicate, true);
  assert.equal(a.id, b.id);
  const c = repo.insertTx({ amountKop: -500000, source: "applepay" });
  const d = repo.insertTx({ amountKop: -500000, source: "applepay" });
  assert.notEqual(c.id, d.id);
});

test("card usage counts only outgoing payments of this month", () => {
  repo.createCard({ bank: "ПУМБ", last4: "5678", owner: "", kind: "personal", monthly_limit: 3000000, mono_account_id: null });
  const card = repo.findCard({ last4: "5678" })!;
  repo.insertTx({ amountKop: -1000000, source: "sms", cardId: card.id });
  repo.insertTx({ amountKop: 700000, source: "sms", cardId: card.id });
  repo.insertTx({ amountKop: -900000, source: "sms", cardId: card.id, occurredAt: "2020-01-15T10:00:00.000Z" });
  assert.equal(repo.cardUsage().get(card.id), 1000000);
});

test("suggestions prefer the center used for the same counterparty", () => {
  const sales = center("Отдел продаж").id;
  const { id } = repo.insertTx({ amountKop: -1000, source: "applepay", counterparty: "WOG" });
  repo.assignTx(id, center("Личные").id);
  assert.equal(repo.suggestCenters({ counterparty: "WOG", description: "" })[0], center("Личные").id);
  assert.ok(repo.suggestCenters({ counterparty: "", description: "" }).includes(sales));
});

test("sub-category spend and forecast roll up; fuel pace triggers an alert", () => {
  const today = new Date(2026, 10, 3, 12);
  repo.createCenter("Семья", null, "#000000", 0, false);
  const personal = center("Семья").id;
  repo.createCenter("Топливо", personal, "#000000", 25_000_00, false);
  repo.createCenter("Продукты", personal, "#000000", 0, false);
  const fuel = center("Топливо").id;
  const food = center("Продукты").id;
  repo.insertTx({ amountKop: -10_000_00, source: "applepay", costCenterId: fuel, occurredAt: new Date(2026, 10, 2, 10).toISOString() });
  repo.insertTx({ amountKop: -1_500_00, source: "applepay", costCenterId: food, occurredAt: new Date(2026, 10, 3, 9).toISOString() });

  const stats = repo.centerStats(today);
  assert.equal(stats.get(fuel)!.status, "pace");
  assert.equal(stats.get(fuel)!.forecast, 100_000_00);
  assert.equal(stats.get(food)!.status, "none");
  assert.equal(stats.get(personal)!.spent, 11_500_00);

  const kids = repo.childStats(personal, today).map((c) => c.name);
  assert.deepEqual(kids.slice(0, 2), ["Топливо", "Продукты"]);
  assert.ok(repo.budgetAlerts(today).some((a) => a.id === fuel));
  assert.equal(repo.centerTransactions(personal, today).length, 2);

  repo.setCenterBudget(fuel, 120_000_00);
  assert.equal(repo.centerStats(today).get(fuel)!.status, "ok");
});
