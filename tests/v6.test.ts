import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DN_DB_PATH = ":memory:";
process.env.TZ = "Europe/Kyiv";
delete process.env.ANTHROPIC_API_KEY;
const repo = await import("../lib/repo.ts");
const cats = await import("../lib/categories.ts");
const fop = await import("../lib/fop.ts");
const hours = await import("../lib/hours.ts");
const fc = await import("../lib/forecast.ts");
const plans = await import("../lib/plans.ts");
const { createSalary } = await import("../lib/income.ts");
const { assistantContext, askAssistant } = await import("../lib/assistant.ts");
const { setSetting } = await import("../lib/settings.ts");

const personal = () => repo.listCenters().find((c) => c.name === "Личные")!.id;

test("ФОП 3 группа: налог 5% и военный сбор 1% от дохода на ФОП-карты, ЕСВ, сроки", () => {
  repo.createCard({ bank: "Monobank", last4: "9090", owner: "", kind: "fop", monthly_limit: 0, mono_account_id: null });
  const fopCard = repo.listCards().find((c) => c.last4 === "9090")!.id;
  repo.createCard({ bank: "OTP Bank", last4: "1111", owner: "", kind: "personal", monthly_limit: 0, mono_account_id: null });
  const personalCard = repo.listCards().find((c) => c.last4 === "1111")!.id;
  // III квартал 2026: 200 000 ₴ на ФОП-карту, 50 000 ₴ на личную (не считается)
  repo.insertTx({ amountKop: 150_000_00, source: "manual", cardId: fopCard, occurredAt: new Date(2026, 7, 10, 12).toISOString() });
  repo.insertTx({ amountKop: 50_000_00, source: "manual", cardId: fopCard, occurredAt: new Date(2026, 8, 5, 12).toISOString() });
  repo.insertTx({ amountKop: 50_000_00, source: "manual", cardId: personalCard, occurredAt: new Date(2026, 8, 6, 12).toISOString() });
  assert.deepEqual(fop.fopDuties(new Date(2026, 9, 5)), [], "группа не выбрана — ничего не считаем");
  fop.saveFopSettings({ group: 3, minWage: 8_647_00, rate: 5 });
  const d = fop.fopDuties(new Date(2026, 9, 5, 12)); // 5 октября
  const tax = d.find((x) => x.title === "Единый налог" && x.period.startsWith("III"))!;
  assert.equal(tax.amount, 10_000_00, "5% от 200 000");
  assert.equal(tax.due, "2026-11-19", "50 дней после 30 сентября");
  assert.equal(d.find((x) => x.title === "Военный сбор" && x.period.startsWith("III"))!.amount, 2_000_00);
  assert.equal(d.find((x) => x.title === "Декларация" && x.period.startsWith("III"))!.due, "2026-11-09");
  const esv = d.find((x) => x.title.startsWith("ЕСВ") && x.period.startsWith("III"))!;
  assert.equal(esv.amount, 1_902_34 * 3);
  assert.equal(esv.due, "2026-10-20");
  assert.ok(d.every((x) => x.due >= "2026-10-05"), "прошедшие сроки не показываем");
  const y = fop.fopYear(new Date(2026, 9, 5));
  assert.equal(y.income, 200_000_00);
  assert.equal(y.limit, 8_647_00 * 1167);
  // 2 группа — фиксированные суммы каждый месяц
  fop.saveFopSettings({ group: 2, minWage: 8_647_00 });
  const d2 = fop.fopDuties(new Date(2026, 9, 5));
  assert.equal(d2.find((x) => x.title === "Единый налог")!.amount, 1_729_40);
  assert.equal(d2.find((x) => x.title === "Военный сбор")!.amount, 864_70);
  fop.saveFopSettings({ group: null });
});

test("часы работы: от ставки или своя цена часа", () => {
  assert.equal(hours.inWorkTime(100_00), "", "без ставки — пусто");
  createSalary({ title: "Ставка", amountKop: 42_000_00, day: 28 });
  assert.equal(hours.hourRate(), 250_00, "42 000 / 168 = 250 ₴ в час");
  assert.equal(hours.inWorkTime(-625_00), "≈ 2,5 ч работы");
  assert.equal(hours.inWorkTime(75_00), "≈ 18 мин работы");
  assert.equal(hours.inWorkTime(12_000_00), "≈ 6 дней работы");
  hours.setHourRate(100_00);
  assert.equal(hours.inWorkTime(100_00), "≈ 1 ч работы");
  hours.setHourRate(null);
});

test("прогноз на 30 дней: стартовая сумма, обычные траты, зарплата и платежи; первый день в минусе", () => {
  const now = new Date(2026, 10, 14, 12);
  // обычные траты: 60 000 ₴ за 60 дней → 1 000 ₴ в день
  for (let i = 1; i <= 60; i++) {
    const id = repo.insertTx({ amountKop: -1_000_00, source: "manual", costCenterId: personal(), occurredAt: new Date(2026, 10, 14 - i, 10).toISOString(), description: "еда" }).id;
    cats.setTxDetails(id, { note: "еда" });
  }
  assert.equal(fc.usualPerDay(now), 1_000_00);
  plans.createPlan({ title: "Аренда", total: 12_000_00, dueDate: "2026-11-16", centerId: personal(), repeat: "month" });
  const f = fc.forecast30(now, { amount: 15_000_00, known: true });
  assert.equal(f.days.length, 31);
  const d16 = f.days.find((d) => d.date === "2026-11-16")!;
  assert.ok(d16.events.some((e) => e.title === "Аренда" && e.amount === -12_000_00));
  assert.equal(d16.balance, 15_000_00 - 2 * 1_000_00 - 12_000_00);
  // ставка 28-го (создана в тесте выше) приходит; аренда повторяется 16 декабря
  assert.ok(f.days.some((d) => d.date === "2026-11-28" && d.events.some((e) => e.amount > 0)));
  assert.equal(f.days[30].date, "2026-12-14", "ровно 30 дней вперёд");
  assert.equal(f.days.find((d) => d.date === "2026-11-17")!.balance, 0, "17-го — ровно ноль");
  assert.equal(f.shortDay?.date, "2026-11-18", "18-го — первый день в минусе");
  assert.ok(f.min.balance < 0);
});

test("помощник: данные для ИИ без номеров карт; без ключа — понятная ошибка", async () => {
  const ctx = assistantContext(new Date(2026, 10, 14, 12));
  const all = JSON.stringify(ctx);
  assert.ok(ctx.операции.length > 0);
  assert.ok(!all.includes("9090") && !all.includes("1111"), "последние цифры карт не уходят в ИИ");
  await assert.rejects(askAssistant([], "сколько я потратил?"), /не подключён/);
  setSetting("x", "1");
});
