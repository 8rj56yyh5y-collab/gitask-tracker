import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DN_DB_PATH = ":memory:";
process.env.TZ = "Europe/Kyiv";
delete process.env.ANTHROPIC_API_KEY;
const repo = await import("../lib/repo.ts");
const cats = await import("../lib/categories.ts");
const goals = await import("../lib/goals.ts");
const ins = await import("../lib/insights.ts");
const plans = await import("../lib/plans.ts");
const { findSections, SECTIONS } = await import("../lib/sections.ts");
const { createSalary } = await import("../lib/income.ts");
const { weekSummaryText } = await import("../lib/telegram.ts");
const { DEFAULT_NAV, NAV_ITEMS, NAV_MAX, parseNav } = await import("../lib/nav.ts");

const personal = () => repo.listCenters().find((c) => c.name === "Личные")!.id;
const cat = (name: string) => cats.listCategories(true).find((c) => c.name === name)!.id;
/** Расход в личном направлении, с категорией, в нужный день. */
function spend(kop: number, counterparty: string, at: Date, category = "Продукты", note = "покупка") {
  const id = repo.insertTx({ amountKop: -kop, source: "manual", counterparty, occurredAt: at.toISOString(), costCenterId: personal(), description: note }).id;
  cats.setTxDetails(id, { categoryId: cat(category), note });
  return id;
}

test("меню 4.0: Главная · Траты · Платежи · Деньги", () => {
  assert.deepEqual(DEFAULT_NAV, ["home", "spend", "plans", "wallets"]);
  assert.equal(NAV_MAX, 4);
  assert.equal(NAV_ITEMS.find((i) => i.id === "spend")!.href, "/spend");
  assert.equal(NAV_ITEMS.find((i) => i.id === "wallets")!.label, "Деньги");
  assert.equal(parseNav("home,cards,cash,plans,sales").length, 4);
});

test("поиск разделов: по тому, как это называют люди", () => {
  assert.ok(findSections("телеграм").some((s) => s.href === "/settings"));
  assert.ok(findSections("копилка").some((s) => s.href === "/goals"));
  assert.ok(findSections("подписки").some((s) => s.href === "/plans"));
  assert.ok(findSections("ТЁМНАЯ тема").some((s) => s.href === "/settings"), "регистр и ё не важны");
  assert.deepEqual(findSections("   "), []);
  assert.equal(new Set(SECTIONS.map((s) => s.href)).size, SECTIONS.length, "без повторов");
});

test("поиск операций: магазин, комментарий, категория, сумма", () => {
  const now = new Date();
  const id = spend(18_550, "Сильпо", now, "Продукты", "еда на неделю");
  assert.ok(repo.searchTx("сильпо").some((t) => t.id === id));
  assert.ok(repo.searchTx("НЕДЕЛЮ").some((t) => t.id === id));
  assert.ok(repo.searchTx("продукты сильпо").some((t) => t.id === id), "все слова сразу");
  assert.ok(repo.searchTx("185,5").some((t) => t.id === id), "по сумме с запятой");
  assert.equal(repo.searchTx("сильпо такси").length, 0);
  assert.deepEqual(repo.searchTx(""), []);
});

test("копилки: собрать, взять, сколько откладывать в месяц", () => {
  const id = goals.createGoal({ name: "Отпуск", emoji: "✈️", target: 30_000_00, deadline: "2026-12-31", start: 6_000_00 });
  let g = goals.getGoal(id)!;
  assert.equal(g.saved, 6_000_00);
  assert.equal(g.pct, 20);
  goals.addToGoal(id, 4_000_00, "премия");
  goals.addToGoal(id, -1_000_00);
  g = goals.getGoal(id)!;
  assert.equal(g.saved, 9_000_00);
  assert.throws(() => goals.addToGoal(id, -10_000_00), /столько нет/);
  assert.throws(() => goals.createGoal({ name: " ", target: 1 }), /Назовите/);
  const v = goals.view({ ...g }, new Date(2026, 10, 14));
  assert.equal(v.monthsLeft, 2, "ноябрь и декабрь");
  assert.equal(v.perMonth, 10_500_00, "21 000 ₴ за 2 месяца");
  goals.addToGoal(id, 21_000_00);
  assert.equal(goals.getGoal(id)!.done, true);
  goals.archiveGoal(id);
  assert.equal(goals.getGoal(id), null);
});

test("подписки: одинаковая сумма каждый месяц — нашлась; продукты с разными суммами — нет; добавили — пропала", () => {
  const now = new Date(2026, 10, 14, 12);
  for (const m of [8, 9, 10]) spend(259_00, "Netflix", new Date(2026, m, 5, 10), "Подписки", "сериалы");
  for (const [m, s] of [[8, 900_00], [9, 1450_00], [10, 600_00]] as const) spend(s, "Metro", new Date(2026, m, 7, 10));
  for (const m of [6, 7]) spend(99_00, "Старый сервис", new Date(2026, m, 3, 10), "Подписки", "старое");
  const found = ins.detectSubscriptions(now);
  const nf = found.find((s) => s.counterparty === "Netflix");
  assert.ok(nf, "Netflix найден");
  assert.equal(nf!.amount, 259_00);
  assert.equal(nf!.next, "2026-12-05");
  assert.ok(!found.some((s) => s.counterparty === "Metro"), "разные суммы — не подписка");
  assert.ok(!found.some((s) => s.counterparty === "Старый сервис"), "давно не списывалось — отменили");
  plans.createPlan({ title: "Netflix", payee: "Netflix", total: 259_00, dueDate: nf!.next, repeat: "month" });
  assert.ok(!ins.detectSubscriptions(now).some((s) => s.counterparty === "Netflix"), "уже в платежах");
  for (const m of [8, 9, 10]) spend(150_00, "Spotify", new Date(2026, m, 9, 10), "Подписки", "музыка");
  assert.ok(ins.detectSubscriptions(now).some((s) => s.counterparty === "Spotify"));
  ins.hideSubscription("Spotify");
  assert.ok(!ins.detectSubscriptions(now).some((s) => s.counterparty === "Spotify"), "«Не то» — больше не предлагаем");
});

test("необычные траты: сравнение с теми же днями прошлых месяцев", () => {
  const now = new Date(2026, 10, 14, 12);
  for (const m of [7, 8, 9]) spend(1_000_00, "Кафе Х", new Date(2026, m, 10, 12), "Кафе и рестораны");
  for (const m of [7, 8, 9]) spend(5_000_00, "Кафе Х", new Date(2026, m, 25, 12), "Кафе и рестораны"); // после 14-го — не считается
  spend(2_500_00, "Кафе Х", new Date(2026, 10, 10, 12), "Кафе и рестораны");
  const u = ins.unusualSpending(now).find((x) => x.name === "Кафе и рестораны");
  assert.ok(u, "в 2,5 раза больше обычного к этому дню");
  assert.equal(u!.usual, 1_000_00);
  assert.equal(u!.pct, 150);
});

test("сколько можно тратить: доходы + ожидаемая ставка − траты − платежи месяца", () => {
  const now = new Date();
  const s0 = ins.safeToSpend(now);
  createSalary({ title: "Ставка", amountKop: 40_000_00, day: 28 }, now);
  const s = ins.safeToSpend(now);
  if (now.getDate() <= 28) {
    assert.equal(s.known, true);
    assert.equal(s.expected - s0.expected, 40_000_00);
    assert.equal(s.left, s.income + s.expected - s.spent - s.toPay);
    if (s.left > 0) assert.ok(s.perDay > 0 && s.perDay * s.daysLeft <= s.left);
  }
  assert.ok(s.daysLeft >= 1);
});

test("итог недели: сумма, сравнение, крупнейшая трата", () => {
  const now = new Date(2026, 10, 16, 11); // понедельник
  spend(300_00, "АТБ", new Date(2026, 10, 12, 12));
  spend(3_000_00, "WOG", new Date(2026, 10, 13, 12), "Топливо", "бензин");
  spend(500_00, "АТБ", new Date(2026, 10, 4, 12));
  const w = ins.weekSummary(now);
  assert.ok(w.spent >= 1_500_00);
  assert.ok(w.count >= 2);
  assert.equal(w.biggest?.counterparty, "WOG", "самая крупная — бензин, а не самая мелкая");
  const text = weekSummaryText(now)!;
  assert.match(text, /Итог недели/);
  assert.match(text, /Самая крупная/);
});
