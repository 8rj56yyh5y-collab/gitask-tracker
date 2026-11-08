import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DN_DB_PATH = ":memory:";
process.env.TZ = "Europe/Kyiv";
delete process.env.ANTHROPIC_API_KEY;
const repo = await import("../lib/repo.ts");
const cats = await import("../lib/categories.ts");
const cash = await import("../lib/cash.ts");
const { parseNav, DEFAULT_NAV, NAV_MAX } = await import("../lib/nav.ts");
const { suggestForTx } = await import("../lib/suggest.ts");
const { suggestCategory } = await import("../lib/ai.ts");

test("каталог: много категорий, частые включены, можно включать/выключать и добавлять свои", () => {
  const all = cats.listCategories(true);
  assert.ok(all.length >= 40);
  const on = cats.listCategories();
  assert.ok(on.length >= 15 && on.length < all.length);
  assert.ok(on.some((c) => c.name === "Продукты"));
  const coffee = all.find((c) => c.name === "Кофе")!;
  assert.equal(coffee.enabled, 0);
  cats.setCategoryEnabled(coffee.id, true);
  assert.ok(cats.listCategories().some((c) => c.id === coffee.id));
  const mine = cats.addCategory("Рыбалка", "🎣");
  assert.ok(cats.listCategories().some((c) => c.id === mine && c.custom === 1));
  assert.equal(cats.addCategory("рыбалка"), mine, "без дублей");
  assert.throws(() => cats.addCategory("  "), /название/);
});

test("подсказка: по истории этого магазина; без ключа ИИ — ничего не ломается", async () => {
  const food = cats.listCategories().find((c) => c.name === "Продукты")!.id;
  const a = repo.insertTx({ amountKop: -50_000, source: "applepay", counterparty: "АТБ" }).id;
  cats.setTxDetails(a, { categoryId: food, note: "продукты" });
  const b = repo.insertTx({ amountKop: -30_000, source: "applepay", counterparty: "АТБ" }).id;
  await suggestForTx(b);
  assert.equal(repo.getTx(b)!.ai_category_id, food);
  assert.deepEqual(cats.suggestedCategories(repo.getTx(b)!, 3)[0], food);
  const c = repo.insertTx({ amountKop: -10_000, source: "applepay", counterparty: "Неизвестно ООО" }).id;
  await suggestForTx(c);
  assert.equal(repo.getTx(c)!.ai_category_id, null);
  assert.equal(await suggestCategory(repo.getTx(c)!, [{ id: food, name: "Продукты" }]), null);
});

test("комментарий обязателен: без него операция ждёт в списке", () => {
  const center = repo.listCenters().find((c) => c.name === "Личные")!.id;
  const t = repo.insertTx({ amountKop: -20_000, source: "applepay", counterparty: "WOG" }).id;
  repo.assignTx(t, center);
  cats.markNeedsNote(t);
  assert.ok(repo.listUnassigned().some((x) => x.id === t));
  cats.setTxDetails(t, { note: "   " });
  assert.ok(repo.listUnassigned().some((x) => x.id === t), "пустой комментарий не считается");
  cats.setTxDetails(t, { note: "бензин" });
  assert.ok(!repo.listUnassigned().some((x) => x.id === t));
});

test("траты по категориям и по дням", () => {
  const { from, to } = repo.monthBounds();
  const rows = cats.spendByCategory(from, to);
  assert.ok(rows.some((r) => r.name === "Продукты" && r.spent >= 50_000));
  const days = repo.dailyTotals(new Date());
  assert.equal(days.length, new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate());
  assert.ok(days[new Date().getDate() - 1].expense >= 80_000);
});

test("кассы получают разные цвета; карту можно удалить, операции остаются", () => {
  const a = cash.createCashbox({ name: "Первая" });
  const b = cash.createCashbox({ name: "Вторая" });
  assert.notEqual(cash.getCashbox(a)!.color, cash.getCashbox(b)!.color);
  repo.createCard({ bank: "OTP Bank", last4: "7777", owner: "", kind: "personal", monthly_limit: 0, mono_account_id: null });
  const card = repo.findCard({ last4: "7777" })!.id;
  const t = repo.insertTx({ amountKop: -1_000, source: "manual", cardId: card }).id;
  repo.deleteCard(card);
  assert.equal(repo.getCard(card), null);
  assert.ok(repo.getTx(t));
  assert.equal(repo.getTx(t)!.card_id, null);
});

test("нижнее меню: свой набор, не больше пяти, мусор отбрасывается", () => {
  assert.deepEqual(parseNav(undefined), DEFAULT_NAV);
  assert.deepEqual(parseNav("history,analytics,bogus"), ["history", "analytics"]);
  assert.equal(parseNav("home,cards,cash,plans,sales,history,income").length, NAV_MAX);
  assert.deepEqual(parseNav(",,"), DEFAULT_NAV);
});

test("карта из Apple Pay: не узнали → выбрали вручную → дальше узнаётся сама, лимит считается", () => {
  repo.createCard({ bank: "Радабанк", last4: "1111", owner: "", kind: "personal", monthly_limit: 1_000_000, mono_account_id: null });
  repo.createCard({ bank: "Радабанк", last4: "2222", owner: "", kind: "personal", monthly_limit: 1_000_000, mono_account_id: null });
  const raw = JSON.stringify({ amount: "₴300,00", merchant: "Сильпо", card: "Rada Gold" });
  assert.equal(repo.findCard({ hint: "Rada Gold" }), null, "две карты банка — угадывать нельзя");
  const t = repo.insertTx({ amountKop: -30_000, source: "applepay", counterparty: "Сильпо", description: "Rada Gold", raw }).id;
  assert.ok(repo.needsCard(repo.getTx(t)!));
  const card = repo.findCard({ last4: "2222" })!.id;
  repo.setTxCard(t, card);
  assert.equal(repo.getTx(t)!.card_id, card);
  assert.equal(repo.getTx(t)!.description, "", "название карты убрано из описания");
  assert.equal(repo.cardUsage().get(card), 30_000, "оплата попала в лимит карты");
  assert.equal(repo.findCard({ hint: "rada  gold" })!.id, card, "в следующий раз карта узнаётся по названию");
});
