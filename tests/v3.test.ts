import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DN_DB_PATH = ":memory:";
process.env.TZ = "Europe/Kyiv";
delete process.env.ANTHROPIC_API_KEY;
const repo = await import("../lib/repo.ts");
const cats = await import("../lib/categories.ts");
const quick = await import("../lib/quick.ts");
const ins = await import("../lib/insights.ts");
const { monthRecap } = await import("../lib/recap.ts");
const { setSetting } = await import("../lib/settings.ts");

const personal = () => repo.listCenters().find((c) => c.name === "Личные")!.id;
const work = () => repo.listCenters().find((c) => c.name === "Отдел продаж")!.id;
const cat = (name: string) => cats.listCategories(true).find((c) => c.name === name)!.id;
function spend(kop: number, cp: string, at: Date, category = "Продукты", note = "покупка", center = personal()) {
  const id = repo.insertTx({ amountKop: -kop, source: "manual", counterparty: cp, occurredAt: at.toISOString(), costCenterId: center, description: note }).id;
  cats.setTxDetails(id, { categoryId: cat(category), note });
  return id;
}

test("строка: сумма в любом месте, копейки, разряды, тысячи", () => {
  assert.deepEqual(quick.parseQuick("кофе 75"), { amount: 75_00, note: "кофе" });
  assert.deepEqual(quick.parseQuick("75 кофе"), { amount: 75_00, note: "кофе" });
  assert.deepEqual(quick.parseQuick("такси 146,50"), { amount: 146_50, note: "такси" });
  assert.deepEqual(quick.parseQuick("аренда 12 000"), { amount: 12_000_00, note: "аренда" });
  assert.deepEqual(quick.parseQuick("ремонт 1,5к"), { amount: 1_500_00, note: "ремонт" });
  assert.deepEqual(quick.parseQuick("обед 230 грн"), { amount: 230_00, note: "обед" });
  assert.deepEqual(quick.parseQuick("продукты"), { amount: 0, note: "продукты" });
  assert.equal(quick.parseQuick("кофе 7.5").amount, 7_50);
});

test("строка: категория по словам, по названию и по своей истории", () => {
  cats.setCategoryEnabled(cat("Кафе и рестораны"), true);
  cats.setCategoryEnabled(cat("Такси"), true);
  cats.setCategoryEnabled(cat("Аптека"), true);
  assert.equal(quick.guessQuick("такси 146").category?.name, "Такси");
  assert.equal(quick.guessQuick("uklon 146").category?.name, "Такси");
  assert.equal(quick.guessQuick("аптека 300").how, "word");
  assert.equal(quick.guessQuick("обед с коллегами 230").category?.name, "Кафе и рестораны");
  const g0 = quick.guessQuick("непонятное 50");
  assert.equal(g0.categoryId, null);
  // История: «шаурма» уже записывали как кафе по работе — берём так же.
  spend(120_00, "", new Date(), "Кафе и рестораны", "шаурма", work());
  const g = quick.guessQuick("шаурма 120");
  assert.equal(g.how, "history");
  assert.equal(g.centerId, work());
  // Без истории — направление как в прошлый раз (или личное).
  setSetting("last_center", String(personal()));
  assert.equal(quick.guessQuick("такси 100").centerId, personal());
});

test("быстрые траты: регулярное и примерно за одни деньги; аренду и разовое — нет", () => {
  const now = Date.now();
  for (let i = 1; i <= 4; i++) spend(72_00 + (i % 2) * 300, "Aroma Kava", new Date(now - i * 3 * 864e5), "Кафе и рестораны", "кофе");
  for (let i = 1; i <= 3; i++) spend(12_000_00, "Хозяин", new Date(now - i * 10 * 864e5), "Аренда жилья", "аренда");
  spend(5_000_00, "Rozetka", new Date(now - 864e5), "Техника и электроника", "наушники");
  const t = quick.quickTemplates();
  const kava = t.find((x) => x.title === "Aroma Kava");
  assert.ok(kava, "кофе — быстрая трата");
  assert.equal(kava!.amount, 75_00);
  assert.equal(kava!.categoryId, cat("Кафе и рестораны"));
  assert.ok(!t.some((x) => x.title === "Хозяин"), "крупные регулярные — это платежи, не быстрые траты");
  assert.ok(!t.some((x) => x.title === "Rozetka"));
});

test("серия: дни подряд, когда всё записано; неразобранное вчера рвёт серию", () => {
  const base = new Date(2026, 5, 20, 12);
  for (let i = 1; i <= 3; i++) spend(100_00, "АТБ", new Date(2026, 5, 20 - i, 12));
  assert.equal(ins.streakDays(base), 3);
  repo.insertTx({ amountKop: -50_00, source: "applepay", counterparty: "Непонятно", occurredAt: new Date(2026, 5, 18, 15).toISOString() });
  assert.equal(ins.streakDays(base), 1, "18-е не разобрано — серия только 19-е");
  repo.insertTx({ amountKop: -50_00, source: "applepay", counterparty: "Сегодня", occurredAt: new Date(2026, 5, 20, 9).toISOString() });
  assert.equal(ins.streakDays(base), 1, "сегодняшнее неразобранное серию не рвёт");
  assert.equal(ins.greeting(new Date(2026, 0, 1, 8)), "Доброе утро");
  assert.equal(ins.greeting(new Date(2026, 0, 1, 23)), "Добрый вечер");
});

test("итоги месяца: сумма, главная категория, любимое место, крупнейшая трата, дни без трат", () => {
  spend(300_00, "Сильпо", new Date(2026, 2, 2, 12));
  spend(500_00, "Сильпо", new Date(2026, 2, 9, 12));
  spend(2_000_00, "Пузата хата", new Date(2026, 2, 14, 12), "Кафе и рестораны", "ужин");
  spend(400_00, "Сильпо", new Date(2026, 1, 10, 12));
  const r = monthRecap(2026, 2);
  assert.equal(r.spent, 2_800_00);
  assert.equal(r.prevSpent, 400_00);
  assert.equal(r.count, 3);
  assert.equal(r.topCats[0].name, "Кафе и рестораны");
  assert.equal(r.topCats[0].share, 71);
  assert.equal(r.favPlace?.name, "Сильпо");
  assert.equal(r.favPlace?.n, 2);
  assert.equal(r.biggest?.amount, 2_000_00);
  assert.equal(r.noSpendDays, 31 - 3);
  assert.equal(monthRecap(2025, 0).count, 0);
});

test("операции за день — по местному времени", () => {
  const id = spend(99_00, "Ночной магазин", new Date(2026, 3, 5, 23, 30));
  assert.ok(repo.listTxOn("2026-04-05").some((t) => t.id === id));
  assert.ok(!repo.listTxOn("2026-04-06").some((t) => t.id === id));
});

test("голос: числа словами → цифры, слова не трогаем", async () => {
  const { spokenToText } = await import("../lib/spoken.ts");
  assert.equal(spokenToText("кофе семьдесят пять"), "кофе 75");
  assert.equal(spokenToText("такси сто сорок шесть гривен"), "такси 146");
  assert.equal(spokenToText("аренда двенадцать тысяч"), "аренда 12000");
  assert.equal(spokenToText("ремонт тысяча двести"), "ремонт 1200");
  assert.equal(spokenToText("кофе 75"), "кофе 75");
  assert.equal(quick.parseQuick(spokenToText("обед двести тридцать")).amount, 230_00);
});

test("лимиты по категориям: в норме → почти → перелимит; убрать лимит", async () => {
  const { categoryBudgets, setCategoryBudget } = await import("../lib/catbudget.ts");
  const { lookOf, normalizeTheme } = await import("../lib/theme.ts");
  const now = new Date(2026, 7, 20, 12);
  const cafe = cat("Кафе и рестораны");
  setCategoryBudget(cafe, 1_000_00);
  spend(500_00, "Кафе", new Date(2026, 7, 5, 12), "Кафе и рестораны", "обед");
  let b = categoryBudgets(now).find((x) => x.categoryId === cafe)!;
  assert.equal(b.level, "ok");
  assert.equal(b.left, 500_00);
  spend(350_00, "Кафе", new Date(2026, 7, 6, 12), "Кафе и рестораны", "ужин");
  assert.equal(categoryBudgets(now).find((x) => x.categoryId === cafe)!.level, "near");
  spend(300_00, "Кафе", new Date(2026, 7, 7, 12), "Кафе и рестораны", "кофе", work());
  assert.equal(categoryBudgets(now).find((x) => x.categoryId === cafe)!.level, "near", "траты по работе в мой лимит не входят");
  assert.equal(categoryBudgets(now, true).find((x) => x.categoryId === cafe)!.level, "over", "в простом режиме считаются все");
  spend(200_00, "Кафе", new Date(2026, 7, 8, 12), "Кафе и рестораны", "кофе");
  b = categoryBudgets(now).find((x) => x.categoryId === cafe)!;
  assert.equal(b.level, "over");
  assert.equal(b.left, -50_00);
  setCategoryBudget(cafe, null);
  assert.equal(categoryBudgets(now).length, 0);
  // оформления
  assert.equal(normalizeTheme(undefined), "premium", "по умолчанию — «Премиум»");
  assert.equal(lookOf("premium"), "flat");
  assert.equal(lookOf("system"), "glass");
  assert.equal(lookOf("graphite"), "flat");
  assert.equal(normalizeTheme("classic"), "classic");
  assert.equal(normalizeTheme("бред"), "premium");
});
