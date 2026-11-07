import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DN_DB_PATH = ":memory:";
process.env.TZ = "Europe/Kyiv";
const repo = await import("../lib/repo.ts");
const cash = await import("../lib/cash.ts");
const plans = await import("../lib/plans.ts");
const sales = await import("../lib/sales.ts");
const center = (n: string) => repo.listCenters().find((c) => c.name.startsWith(n))!.id;

test("cashbox balance: opening + income − expense; transfers are not expenses", () => {
  const boss = cash.createCashbox({ name: "Касса руководителя", owner: "руководитель", opening: 2_000_000 });
  cash.cashMove(boss, { amountKop: 500_000, note: "дал руководитель" });
  cash.cashMove(boss, { amountKop: -150_000, note: "бензин", centerId: center("Руководитель") });
  assert.equal(cash.cashBalances().get(boss), 2_350_000);
  repo.createCard({ bank: "ПриватБанк", last4: "1234", owner: "", kind: "personal", monthly_limit: 0, mono_account_id: null });
  const card = repo.findCard({ last4: "1234" })!.id;
  cash.transfer({ card }, { cashbox: boss }, 1_000_000, "снял в банкомате");
  assert.equal(cash.cashBalances().get(boss), 3_350_000);
  // перевод не попадает ни в расходы, ни в «нужно записать»
  assert.ok(!repo.listUnassigned().some((t) => t.description === "снял в банкомате"));
  assert.deepEqual(cash.parseAccount("card:5"), { card: 5 });
  assert.deepEqual(cash.parseAccount("cash:2"), { cashbox: 2 });
  assert.equal(cash.parseAccount("x"), null);
});

test("plan paid in parts: advance 10 000 of 55 000, then the rest closes it", () => {
  const id = plans.createPlan({ title: "Бампер", payee: "СТО", total: 5_500_000, centerId: center("Личные") });
  plans.payPlan(id, 1_000_000);
  let p = plans.getPlan(id)!;
  assert.deepEqual([p.paid, p.total - p.paid, p.status], [1_000_000, 4_500_000, "open"]);
  const tx = repo.listRecent(50).find((t) => t.plan_id === id)!;
  assert.equal(tx.cost_center_id, center("Личные"), "payment gets the plan's category");
  plans.payPlan(id, 4_500_000);
  p = plans.getPlan(id)!;
  assert.equal(p.status, "done");
  assert.throws(() => plans.payPlan(id, 100), /закрыт/);
});

test("monthly plan creates the next one after it is paid", () => {
  assert.equal(plans.nextMonth("2026-01-31"), "2026-02-28");
  assert.equal(plans.nextMonth("2026-12-15"), "2027-01-15");
  const id = plans.createPlan({ title: "Связь", total: 30_000, dueDate: "2026-11-10", repeat: "month" });
  plans.payPlan(id, 30_000);
  const next = plans.listPlans("open").find((p) => p.title === "Связь")!;
  assert.equal(next.due_date, "2026-12-10");
});

test("bank operation with the plan's amount near its date marks it paid", () => {
  const id = plans.createPlan({ title: "Перевод Ивану", total: 777_700, dueDate: plans.ymd(new Date()), centerId: center("Отдел продаж") });
  const t = repo.insertTx({ amountKop: -777_700, source: "monobank" }).id;
  assert.equal(plans.matchPlanForTx(t), id);
  assert.equal(plans.getPlan(id)!.status, "done");
  assert.equal(repo.getTx(t)!.cost_center_id, center("Отдел продаж"));
  // другая сумма — не трогаем
  const other = repo.insertTx({ amountKop: -111_100, source: "monobank" }).id;
  assert.equal(plans.matchPlanForTx(other), null);
});

test("reminders: due plans once per day", () => {
  const id = plans.createPlan({ title: "Налог", total: 100_000, dueDate: "2020-01-01" });
  assert.ok(plans.plansToRemind().some((p) => p.id === id));
  plans.markReminded(id);
  assert.ok(!plans.plansToRemind().some((p) => p.id === id));
});

test("company goods: commission is my income, company share is a debt until handed over", () => {
  const g = sales.saveGroup({ name: "Грузики", sales_rate: 7.5, mp_rate: 5 });
  const pid = sales.saveProduct({ name: "Грузики балансировочные", group_id: g, unit: "уп.", tiersText: "1=450; 3=1200" });
  repo.createCard({ bank: "NovaPay", last4: "5050", owner: "", kind: "personal", monthly_limit: 0, mono_account_id: null });
  const nova = repo.findCard({ last4: "5050" })!.id;
  const before = sales.companyDebt();
  const s1 = sales.createSale({ productId: pid, qty: 3, channel: "direct", cardId: nova });
  const sale = sales.getSale(s1)!;
  assert.deepEqual([sale.total, sale.commission, sale.company_share], [120_000, 9_000, 111_000]);
  assert.equal(sales.companyDebt() - before, 111_000);
  // поступление на карту — не мой доход и не «нужно записать»
  const tx = repo.getTx(sale.tx_id!)!;
  assert.equal(tx.kind, "internal");
  assert.ok(!repo.listUnassigned().some((t) => t.id === tx.id));
  // продажа через маркетплейс со своей ценой
  const s2 = sales.getSale(sales.createSale({ productId: pid, qty: 1, channel: "mp", total: 40_000 }))!;
  assert.deepEqual([s2.total, s2.mp_fee, s2.commission, s2.company_share], [40_000, 2_000, 3_000, 35_000]);
  // отдал компании
  sales.payCompany(100_000, { cardId: nova });
  assert.equal(sales.companyDebt() - before, 111_000 + 35_000 - 100_000);
  const m = sales.salesMonth();
  assert.equal(m.commission >= 12_000, true);
  assert.equal(m.byProduct[0].name, "Грузики балансировочные");
});

test("an incoming bank transfer can be turned into a sale", () => {
  const pid = sales.listProducts()[0].id;
  const t = repo.insertTx({ amountKop: 45_000, source: "monobank", counterparty: "Покупатель" }).id;
  assert.ok(repo.listUnassigned().some((x) => x.id === t));
  sales.createSale({ productId: pid, qty: 1, channel: "direct", txId: t });
  assert.equal(repo.getTx(t)!.kind, "internal");
  assert.ok(!repo.listUnassigned().some((x) => x.id === t));
});

test("«мне должны»: поступление частями и автозакрытие входящей суммой", () => {
  const id = plans.createPlan({ title: "Вернуть долг — Олег", total: 500_000, direction: "in", dueDate: plans.ymd(new Date()) });
  plans.payPlan(id, 200_000);
  let p = plans.getPlan(id)!;
  assert.equal(p.paid, 200_000);
  assert.equal(p.direction, "in");
  const tx = repo.listRecent(50).find((t) => t.plan_id === id)!;
  assert.ok(tx.amount > 0, "поступление записано плюсом");
  // расход на ту же сумму не закрывает «мне должны»
  const spend = repo.insertTx({ amountKop: -300_000, source: "monobank" }).id;
  assert.equal(plans.matchPlanForTx(spend), null);
  const income = repo.insertTx({ amountKop: 300_000, source: "monobank" }).id;
  assert.equal(plans.matchPlanForTx(income), id);
  p = plans.getPlan(id)!;
  assert.equal(p.status, "done");
  assert.ok(!plans.listPlans("open", 200, "out").some((x) => x.id === id));
  assert.ok(!plans.plansToRemind().some((x) => x.id === id), "о долгах мне в Telegram «оплатить» не пишем");
});

test("норма трат: 30 дней сбора, предложение, принять или продлить", async () => {
  const norms = await import("../lib/norms.ts");
  const settings = await import("../lib/settings.ts");
  const start = new Date(Date.now() - 40 * 864e5);
  settings.setSetting("norm_start", start.toISOString().slice(0, 10));
  repo.createCenter("Еда тест", null, "#f59e0b", 0, false);
  const food = center("Еда тест");
  const t = repo.insertTx({ amountKop: -1_234_500, source: "manual", occurredAt: new Date(Date.now() - 5 * 864e5).toISOString() }).id;
  repo.assignTx(t, food);
  let s = norms.normState();
  assert.ok(s.ready);
  const row = s.rows.find((r) => r.id === food)!;
  assert.equal(row.spent, 1_234_500);
  // 12 345 ₴ за 40 дней → 9 258,75 ₴ в месяц → вверх до 9 300 ₴
  assert.equal(row.suggested, 930_000);
  norms.acceptNorms(new Map([[food, 1_000_000]]));
  assert.equal(repo.getCenter(food)!.monthly_budget, 1_000_000);
  assert.ok(norms.normState().acceptedAt);
  norms.extendNorm();
  s = norms.normState();
  assert.equal(s.days, 70);
  assert.ok(!s.ready && !s.acceptedAt && s.daysLeft === 30);
  norms.restartNorm();
  assert.equal(norms.normState().elapsed, 0);
  assert.equal(norms.roundUpNorm(0), 0);
});

test("отмена оплаты: ручная удаляется, банковская отвязывается; ежемесячный «следующий» убирается", () => {
  const id = plans.createPlan({ title: "Интернет", total: 30_000, repeat: "month", dueDate: "2026-11-10" });
  const tx = plans.payPlan(id, 30_000);
  assert.equal(plans.getPlan(id)!.status, "done");
  assert.ok(plans.listPlans("open").some((p) => p.title === "Интернет" && p.due_date === "2026-12-10"), "создан следующий");
  assert.equal(plans.undoPlanPayment(tx), id);
  assert.equal(plans.getPlan(id)!.status, "open");
  assert.equal(plans.getPlan(id)!.paid, 0);
  assert.equal(repo.getTx(tx), null, "ручная оплата удалена");
  assert.ok(!plans.listPlans("open").some((p) => p.title === "Интернет" && p.due_date === "2026-12-10"), "следующий убран");
  // оплата из банка: операция остаётся, но платёж снова открыт
  const bank = repo.insertTx({ amountKop: -30_000, source: "monobank", occurredAt: "2026-11-10T10:00:00.000Z" }).id;
  assert.equal(plans.matchPlanForTx(bank), id);
  plans.undoPlanPayment(bank);
  assert.ok(repo.getTx(bank));
  assert.equal(repo.getTx(bank)!.plan_id, null);
  assert.equal(plans.getPlan(id)!.status, "open");
  // отменённый платёж можно вернуть
  plans.cancelPlan(id);
  plans.restorePlan(id);
  assert.equal(plans.getPlan(id)!.status, "open");
});

test("касса привязана к категории: расход без выбора идёт в категорию кассы", () => {
  const sales = center("Отдел продаж");
  const box = cash.createCashbox({ name: "Касса отдела", centerId: sales });
  assert.equal(cash.getCashbox(box)!.center_id, sales);
  const a = cash.cashMove(box, { amountKop: -50_000, note: "канцелярия" });
  assert.equal(repo.getTx(a)!.cost_center_id, sales);
  const b = cash.cashMove(box, { amountKop: -20_000, centerId: center("Личные") });
  assert.equal(repo.getTx(b)!.cost_center_id, center("Личные"), "выбранная вручную категория важнее");
  const c = cash.cashMove(box, { amountKop: 100_000 });
  assert.equal(repo.getTx(c)!.cost_center_id, null, "приход не трогаем");
  cash.updateCashbox(box, { name: "Касса отдела", owner: "", color: "#16a34a", opening: 0, centerId: null });
  assert.equal(cash.getCashbox(box)!.center_id, null);
});

test("сигналы «Команд»: шаг Apple Pay отмечается и при оплате Monobank", async () => {
  const setup = await import("../lib/setup.ts");
  assert.equal(setup.shortcutWorks(), false);
  setup.noteShortcutSignal("bad_key");
  assert.equal(setup.shortcutWorks(), false);
  assert.equal(setup.lastShortcutSignal()!.result, "bad_key");
  setup.noteShortcutSignal("mono_skip", "Monobank Black");
  assert.equal(setup.shortcutWorks(), true);
  assert.equal(setup.setupSteps().find((s) => s.id === "applepay")!.done, true);
});
