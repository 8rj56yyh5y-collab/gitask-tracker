import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

process.env.DN_DB_PATH = ":memory:";
process.env.TZ = "Europe/Kyiv";
const repo = await import("../lib/repo.ts");
const cats = await import("../lib/categories.ts");
const cash = await import("../lib/cash.ts");
const report = await import("../lib/report.ts");
const bal = await import("../lib/balance.ts");
const money = await import("../lib/money.ts");
const settings = await import("../lib/settings.ts");

const center = (n: string) => repo.listCenters().find((c) => c.name === n)!.id;
const cat = (n: string) => cats.listCategories(true).find((c) => c.name === n)!.id;
const fm = (k: number) => money.formatMoney(k).replace(/[\u202f\u00a0]/g, " ");

test("валюта аккаунта: по умолчанию гривна, можно переключить, суммы показываются в ней", () => {
  assert.equal(fm(125_000), "1 250 ₴");
  settings.setCurrency("EUR");
  assert.equal(money.currentCurrency(), "EUR");
  assert.equal(fm(125_050), "1 250,50 €");
  assert.equal(money.curSymbol(), "€");
  settings.setCurrency("PLN");
  assert.equal(fm(-500), "−5 zł");
  settings.setCurrency("UAH");
  assert.equal(fm(100), "1 ₴");
  assert.equal(money.normalizeCurrency("XYZ"), "UAH", "неизвестная — гривна");
});

test("баланс карты: вписали — дальше считается по операциям этой карты и её доп. карт", () => {
  repo.createCard({ bank: "OTP Bank", last4: "7001", owner: "", kind: "personal", monthly_limit: 0, mono_account_id: null });
  const id = repo.listCards().find((c) => c.last4 === "7001")!.id;
  assert.equal(bal.cardBalance(id), null, "не задан — не показываем");
  repo.insertTx({ amountKop: -999_00, source: "manual", cardId: id, occurredAt: new Date(Date.now() - 864e5).toISOString() });
  bal.setCardBalance(id, 10_000_00);
  repo.insertTx({ amountKop: -1_500_00, source: "manual", cardId: id });
  repo.insertTx({ amountKop: 3_000_00, source: "manual", cardId: id });
  assert.equal(bal.cardBalance(id), 11_500_00, "старая трата (до ввода) не считается");
  bal.setCardBalance(id, null);
  assert.equal(bal.cardBalance(id), null);
});

test("отчёт по направлению с кассой: траты, приходы, итог, наличные на начало и конец; Excel открывается", async () => {
  const boss = center("Руководитель");
  const box = cash.createCashbox({ name: "Касса руководителя", opening: 5_000_00, centerId: boss });
  // до периода
  cash.cashMove(box, { amountKop: -1_000_00, note: "старое", at: new Date(2026, 10, 2, 12).toISOString() });
  // в периоде 9–15 ноября
  cash.cashMove(box, { amountKop: 20_000_00, note: "выдали на неделю", at: new Date(2026, 10, 9, 10).toISOString() });
  const t1 = cash.cashMove(box, { amountKop: -3_200_00, counterparty: "АЗС", note: "бензин", at: new Date(2026, 10, 10, 12).toISOString() });
  cats.setTxDetails(t1, { categoryId: cat("Топливо"), note: "бензин" });
  const t2 = repo.insertTx({ amountKop: -800_00, source: "manual", costCenterId: boss, counterparty: "Офис", description: "канцелярия", occurredAt: new Date(2026, 10, 15, 22, 30).toISOString() }).id;
  cats.setTxDetails(t2, { categoryId: cat("Канцелярия"), note: "канцелярия" });
  // чужое направление и другой день — не попадают
  repo.insertTx({ amountKop: -7_00, source: "manual", costCenterId: center("Личные"), occurredAt: new Date(2026, 10, 11, 12).toISOString() });
  repo.insertTx({ amountKop: -9_00, source: "manual", costCenterId: boss, occurredAt: new Date(2026, 10, 16, 0, 30).toISOString() });

  const r = report.buildReport({ kind: "center", id: boss }, "2026-11-09", "2026-11-15");
  assert.equal(r.scopeName, "Руководитель");
  assert.equal(r.income, 20_000_00);
  assert.equal(r.expense, 4_000_00);
  assert.equal(r.net, 16_000_00);
  assert.deepEqual(r.cash, { names: "Касса руководителя", start: 4_000_00, end: 20_800_00 });
  assert.equal(r.ops.length, 3);
  assert.equal(r.byCat[0].name, "Топливо");
  assert.equal(report.periodTitle("2026-11-09", "2026-11-15"), "9–15 ноября 2026");

  const file = await report.reportXlsx(r);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as unknown as ArrayBuffer);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Итог", "Операции"]);
  const ops = wb.getWorksheet("Операции")!;
  assert.equal(ops.getRow(1).getCell(4).value, "Сумма");
  assert.equal(ops.rowCount, 1 + 3 + 1, "заголовок + 3 операции + итого");
  assert.equal(ops.getRow(2).getCell(4).value, 20_000);
  assert.equal(report.reportFileName(r), "Отчёт Руководитель 2026-11-09 - 2026-11-15.xlsx");
});

test("периоды: прошлая неделя — пн–вс, этот месяц, прошлый месяц", () => {
  const mon = new Date(2026, 10, 16, 9); // понедельник
  assert.deepEqual(report.presetRange("lastweek", mon), { from: "2026-11-09", to: "2026-11-15" });
  assert.deepEqual(report.presetRange("week", new Date(2026, 10, 18)), { from: "2026-11-16", to: "2026-11-18" });
  assert.deepEqual(report.presetRange("prevmonth", mon), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(report.parseScope("c:5"), { kind: "center", id: 5 });
  assert.deepEqual(report.parseScope("мусор"), { kind: "all" });
});
