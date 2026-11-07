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

test("categories can be renamed, moved and restored; no cycles", () => {
  repo.createCenter("Авто", null, "#111111", 0, false);
  repo.createCenter("Шины", center("Авто").id, "#111111", 0, false);
  const auto = center("Авто").id, tyres = center("Шины").id;
  repo.updateCenter(auto, { name: "Машина", color: "#222222", parentId: null, internal: false });
  assert.equal(repo.getCenter(auto)!.name, "Машина");
  assert.throws(() => repo.updateCenter(auto, { name: "Машина", color: "#222222", parentId: tyres, internal: false }), /само в себя/);
  repo.updateCenter(tyres, { name: "Шины", color: "#111111", parentId: center("Личные").id, internal: false });
  assert.equal(repo.getCenter(tyres)!.parent_id, center("Личные").id);
  repo.archiveCenter(auto);
  assert.ok(repo.listHiddenCenters().some((c) => c.id === auto));
  repo.restoreCenter(auto);
  assert.ok(repo.listCenters().some((c) => c.id === auto));
});

test("card is found by Wallet card name when there is one card of that bank", () => {
  repo.createCard({ bank: "NovaPay", last4: "7777", owner: "", kind: "personal", monthly_limit: 0, mono_account_id: null });
  assert.equal(repo.findCard({ hint: "NovaPay Card" })!.last4, "7777");
  repo.createCard({ bank: "Радабанк", last4: "1111", owner: "", kind: "personal", monthly_limit: 0, mono_account_id: null });
  repo.createCard({ bank: "Радабанк", last4: "2222", owner: "", kind: "personal", monthly_limit: 0, mono_account_id: null });
  assert.equal(repo.findCard({ hint: "Radabank Visa" }), null, "two cards of one bank — ambiguous");
  assert.equal(repo.findCard({ hint: "Radabank •••• 2222" })!.last4, "2222");
});

test("default card limit applies to new cards and can be applied to cards without a limit", () => {
  repo.setDefaultCardLimit(3_000_000);
  repo.createCard({ bank: "А-Банк", last4: "4321", owner: "", kind: "personal", monthly_limit: 0, mono_account_id: null });
  assert.equal(repo.findCard({ last4: "4321" })!.monthly_limit, 3_000_000);
  repo.createCard({ bank: "ПУМБ", last4: "9876", owner: "", kind: "personal", monthly_limit: 1_000_000, mono_account_id: null });
  assert.equal(repo.findCard({ last4: "9876" })!.monthly_limit, 1_000_000, "explicit limit wins");
  const id = repo.findCard({ last4: "9876" })!.id;
  repo.updateCard(id, { bank: "ПУМБ", last4: "9876", owner: "", kind: "personal", monthly_limit: 0, color: "#000000", badge: "PB" });
  assert.ok(repo.applyDefaultLimit() >= 1);
  const c = repo.getCard(id)!;
  assert.deepEqual([c.monthly_limit, c.color, c.badge], [3_000_000, "#000000", "PB"]);
  repo.setDefaultCardLimit(0);
});

test("cards of one bank merge under a main card with one shared limit", () => {
  for (const l4 of ["0055", "1101", "2202"]) repo.createCard({ bank: "Monobank", last4: l4, owner: "", kind: "personal", monthly_limit: 3_000_000, mono_account_id: null });
  const main = repo.findCard({ last4: "0055" })!, a = repo.findCard({ last4: "1101" })!, b = repo.findCard({ last4: "2202" })!;
  assert.equal(repo.mergeBankCards(main.id) >= 2, true);
  assert.deepEqual(repo.childCards(main.id).map((c) => c.last4).sort(), ["1101", "2202"]);
  assert.ok(repo.listMainCards().some((c) => c.id === main.id));
  assert.ok(!repo.listMainCards().some((c) => c.id === a.id || c.id === b.id));
  repo.insertTx({ amountKop: -100_000, source: "monobank", cardId: a.id });
  repo.insertTx({ amountKop: -50_000, source: "monobank", cardId: b.id });
  repo.insertTx({ amountKop: -25_000, source: "monobank", cardId: main.id });
  assert.equal(repo.groupUsage().get(main.id), 175_000, "main card limit counts all its cards");
  assert.equal(repo.cardTransactions(main.id).length, 3);
  // Apple Pay «Monobank Black»: банк один, основная карта одна — берём основную
  assert.equal(repo.findCard({ hint: "Monobank Black" })!.id, main.id);
  // отделить карту
  repo.setCardParent(b.id, null);
  assert.ok(repo.listMainCards().some((c) => c.id === b.id));
  assert.equal(repo.groupUsage().get(main.id), 125_000);
  assert.throws(() => repo.setCardParent(main.id, main.id), /сама в себя/);
});
