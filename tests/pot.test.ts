import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DN_DB_PATH = ":memory:";
process.env.TZ = "Europe/Kyiv";
const repo = await import("../lib/repo.ts");
const cash = await import("../lib/cash.ts");
const report = await import("../lib/report.ts");
const { getDb } = await import("../lib/db.ts");

const at = (d: number, h = 12) => new Date(2026, 10, d, h).toISOString();

test("касса «D» и направление «D» — одно целое: в кассе и отчёте все траты и приходы направления, ничего не теряется", () => {
  const d = repo.createCenter("D", null, "#7c5cff", 0, false);
  repo.createCard({ bank: "Mono", last4: "4242", owner: "", kind: "personal", monthly_limit: 0, mono_account_id: null });
  const card = repo.listCards().find((c) => c.last4 === "4242")!.id;
  // Траты и приходы направления «D» — с карты и без кассы.
  repo.insertTx({ amountKop: -1_200_00, source: "manual", costCenterId: d, cardId: card, occurredAt: at(10) });
  repo.insertTx({ amountKop: -300_00, source: "manual", costCenterId: d, occurredAt: at(11) });
  repo.insertTx({ amountKop: 5_000_00, source: "manual", costCenterId: d, occurredAt: at(12) });
  const before = (getDb().prepare("SELECT COUNT(*) AS n, SUM(amount) AS s FROM transactions").get() as { n: number; s: number });

  // Касса с коротким названием «D» без выбранного направления — как была у пользователя.
  const box = cash.createCashbox({ name: "D", opening: 1_000_00 });
  const b = cash.getCashbox(box)!;
  assert.equal(b.center_id, d, "касса привязалась к направлению с тем же названием");
  assert.equal(b.pot, 1, "и стала «касса = направление»");
  // Движение самой кассы, отмеченное направлением «D», не считается дважды.
  cash.cashMove(box, { amountKop: -100_00, note: "вода", at: at(13) });
  getDb().prepare("UPDATE transactions SET cost_center_id = ? WHERE cashbox_id = ?").run(d, box);

  assert.equal(cash.cashBalances().get(box), 1_000_00 - 1_200_00 - 300_00 + 5_000_00 - 100_00);
  const st = cash.cashStats(box, new Date(2026, 10, 20));
  assert.equal(st.monthIn, 5_000_00);
  assert.equal(st.monthOut, 1_600_00);

  const rc = report.buildReport({ kind: "cash", id: box }, "2026-11-09", "2026-11-15");
  const rd = report.buildReport({ kind: "center", id: d }, "2026-11-09", "2026-11-15");
  for (const r of [rc, rd]) {
    assert.equal(r.ops.length, 4);
    assert.equal(r.income, 5_000_00);
    assert.equal(r.expense, 1_600_00);
    assert.deepEqual(r.cash && { s: r.cash.start, e: r.cash.end }, { s: 1_000_00, e: 4_400_00 });
  }
  assert.equal(rc.scopeName, "D");

  // Выключили — касса снова только про свои наличные; записи не тронуты.
  cash.setCashboxPot(box, false);
  assert.equal(cash.cashBalances().get(box), 900_00);
  const after = (getDb().prepare("SELECT COUNT(*) AS n, SUM(amount) AS s FROM transactions WHERE cashbox_id IS NULL OR cashbox_id != ?").get(box) as { n: number; s: number });
  assert.deepEqual({ n: Number(after.n), s: Number(after.s) }, { n: Number(before.n), s: Number(before.s) }, "старые записи на месте");
});

test("поправить остаток кассы: корректировка в истории, не приход и не расход, можно удалить", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const box = cash.createCashbox({ name: "Касса склада", opening: 1_000_00 });
  cash.cashMove(box, { amountKop: -200_00, note: "вода", at: new Date().toISOString() });
  assert.equal(cash.cashBalances().get(box), 800_00);
  assert.equal(cash.adjustCashbox(box, 800_00), null, "та же сумма — ничего не пишем");
  const id = cash.adjustCashbox(box, 750_00, "пересчитал")!;
  assert.equal(cash.cashBalances().get(box), 750_00);
  const st = cash.cashStats(box);
  assert.equal(st.monthOut, 200_00, "корректировка — не расход");
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const r = report.buildReport({ kind: "cash", id: box }, ymd, ymd);
  assert.equal(r.expense, 200_00);
  assert.equal(r.adjust, -50_00);
  assert.equal(r.cash!.end, 750_00);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await report.reportXlsx(r)) as unknown as ArrayBuffer);
  const cells: string[] = [];
  wb.getWorksheet("Отчёт")!.eachRow((row) => row.eachCell((c) => cells.push(String(c.value))));
  assert.ok(cells.includes("Корректировки учёта") && cells.includes("Корректировка"), "корректировка видна отдельно");
  getDb().prepare("DELETE FROM transactions WHERE id = ?").run(id);
  assert.equal(cash.cashBalances().get(box), 800_00, "удалили корректировку — остаток вернулся");
});

test("обычная касса без пары по названию остаётся как была", () => {
  const box = cash.createCashbox({ name: "Сейф", opening: 0 });
  const b = cash.getCashbox(box)!;
  assert.equal(b.center_id, null);
  assert.equal(b.pot, 0);
  assert.equal(cash.boxScope(b), `t.cashbox_id = ${box}`);
});

test("похожие, но разные названия не склеиваются в одно целое", () => {
  repo.createCenter("Продукты", null, "#22aa55", 0, false);
  const box = cash.createCashbox({ name: "Касса продажи" });
  assert.equal(cash.getCashbox(box)!.center_id, null);
  assert.equal(cash.getCashbox(box)!.pot, 0);
});

test("касса может уйти в минус; ожидаемые оплаты не списываются, пока не отмечены", async () => {
  const plans = await import("../lib/plans.ts");
  const box = cash.createCashbox({ name: "Касса выезда", opening: 500_00 });
  cash.cashMove(box, { amountKop: -800_00, note: "бензин", at: new Date().toISOString() });
  assert.equal(cash.cashBalances().get(box), -300_00, "минус возможен");
  cash.adjustCashbox(box, -250_00, "пересчитал");
  assert.equal(cash.cashBalances().get(box), -250_00, "поправить можно и в минус");
  cash.adjustCashbox(box, 2_000_00);
  const p = plans.createPlan({ title: "Запчасти — наложенный платёж", payee: "Нова пошта", total: 1_200_00, cashboxId: box });
  const b = cash.getCashbox(box)!;
  assert.deepEqual(cash.cashPending(b).map((x) => x.left), [1_200_00]);
  assert.equal(cash.cashBalances().get(box), 2_000_00, "на руках не изменилось");
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  assert.equal(report.buildReport({ kind: "cash", id: box }, ymd, ymd).pending.length, 1);
  plans.payPlan(p, 1_200_00, { cashboxId: box });
  assert.equal(cash.cashBalances().get(box), 800_00, "оплатил — списалось");
  assert.equal(cash.cashPending(b).length, 0);
});

test("«на руках по факту» — отдельная цифра: учёт и траты не меняются, в отчёте видно обе", async () => {
  const box = cash.createCashbox({ name: "Касса фары", opening: 0 });
  cash.cashMove(box, { amountKop: -11_390_00, counterparty: "Фара", note: "заказ, оплата при получении", at: new Date().toISOString() });
  const before = getDb().prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number };
  cash.setCashFact(box, 30_000_00);
  assert.equal(cash.cashBalances().get(box), -11_390_00, "учёт прежний");
  assert.equal((getDb().prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n, before.n, "записей не добавилось");
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const r = report.buildReport({ kind: "cash", id: box }, ymd, ymd);
  assert.equal(r.cash!.end, -11_390_00);
  assert.equal(r.cash!.fact!.amount, 30_000_00);
  assert.equal(r.expense, 11_390_00);
  await report.reportXlsx(r);
  // После пересчёта: траты наличными уменьшают «на руках», траты с карты и корректировки учёта — нет.
  const later = new Date(Date.now() + 2000).toISOString();
  cash.cashMove(box, { amountKop: -1_500_00, counterparty: "Бензин", at: later });
  cash.cashMove(box, { amountKop: 400_00, counterparty: "Вернули", at: later });
  repo.createCard({ bank: "Mono", last4: "9911", owner: "", kind: "personal", monthly_limit: 0, mono_account_id: null });
  const card = repo.listCards().find((c) => c.last4 === "9911")!.id;
  getDb().prepare("UPDATE transactions SET card_id = ? WHERE id = ?").run(card, cash.cashMove(box, { amountKop: -999_00, at: later }));
  cash.adjustCashbox(box, 0);
  const f = cash.cashFactAt(cash.getCashbox(box)!, new Date(Date.now() + 5000).toISOString())!;
  assert.deepEqual({ amount: f.amount, base: f.base, since: f.since }, { amount: 28_900_00, base: 30_000_00, since: -1_100_00 });
  // На момент раньше пересчёта — наоборот: трата 11 390 до пересчёта ещё не случилась.
  assert.equal(cash.cashFactAt(cash.getCashbox(box)!, new Date(Date.now() - 864e5).toISOString())!.amount, 41_390_00);
  cash.setCashFact(box, null);
  assert.equal(report.buildReport({ kind: "cash", id: box }, ymd, ymd).cash!.fact, null);
});

test("сообщение к отчёту в Telegram: итоги, касса, топ категорий, без лишнего", () => {
  const box = cash.createCashbox({ name: "Касса сообщения", opening: 1_000_00 });
  cash.cashMove(box, { amountKop: -300_00, counterparty: "АЗС", at: new Date().toISOString() });
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const msg = report.reportMessage(report.buildReport({ kind: "cash", id: box }, ymd, ymd)).replace(/[\u202f\u00a0]/g, " ");
  assert.match(msg, /Расходы  <b>−300 ₴<\/b>/);
  assert.match(msg, /Касса  1 000 ₴ → <b>700 ₴<\/b>/);
  assert.doesNotMatch(msg, /На руках|Ждут оплаты/, "пустые строки не показываем");
  assert.ok(msg.length < 1000, "влезает в подпись к файлу");
});
