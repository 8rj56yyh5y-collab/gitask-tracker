import { test } from "node:test";
import assert from "node:assert/strict";

// Точность учёта: одни и те же деньги дают одну и ту же сумму на всех экранах.
process.env.DN_DB_PATH = ":memory:";
process.env.TZ = "Europe/Kyiv";
const repo = await import("../lib/repo.ts");
const cash = await import("../lib/cash.ts");
const report = await import("../lib/report.ts");
const cats = await import("../lib/categories.ts");
const transit = await import("../lib/transit.ts");
const plans = await import("../lib/plans.ts");
const { getDb } = await import("../lib/db.ts");

const now = new Date();
const y = now.getFullYear();
const m = now.getMonth();
const at = (d: number, h = 12) => new Date(y, m, d, h).toISOString();
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const first = ymd(new Date(y, m, 1));
const last = ymd(new Date(y, m + 1, 0));

test("все экраны считают траты одинаково; переводы и чужие деньги не тратами; касса сходится", () => {
  const dir = repo.createCenter("Офис", null, "#336699", 0, false);
  const other = repo.createCenter("Дом", null, "#993366", 0, false);
  repo.createCard({ bank: "Mono", last4: "1111", owner: "", kind: "personal", monthly_limit: 0, mono_account_id: null });
  const card = repo.listCards().find((c) => c.last4 === "1111")!.id;
  const box = cash.createCashbox({ name: "Офис", centerId: dir, opening: 1_000_00 });

  // траты: карта, касса, без кассы наличными, другое направление
  repo.insertTx({ amountKop: -500_00, source: "manual", costCenterId: dir, cardId: card, occurredAt: at(2) });
  cash.cashMove(box, { amountKop: -250_00, note: "вода", at: at(3) });
  repo.insertTx({ amountKop: -100_00, source: "manual", costCenterId: dir, occurredAt: at(3, 15) });
  repo.insertTx({ amountKop: -70_00, source: "manual", costCenterId: other, occurredAt: at(4) });
  // приход в кассу
  cash.cashMove(box, { amountKop: 2_000_00, note: "выдали", at: at(5) });
  // перевод карта → касса: не трата и не приход
  cash.transfer({ card }, { cashbox: box }, 300_00, "сняли", at(6));
  // чужие деньги через кассу: не трата
  const tr = transit.createTransit({ title: "за соседа", amountKop: 400_00 });
  const t1 = repo.insertTx({ amountKop: -400_00, source: "manual", cardId: card, occurredAt: at(7) }).id;
  transit.linkTxToTransit(t1, tr);
  // оплата платежа из кассы
  const p = plans.createPlan({ title: "Интернет", total: 150_00, cashboxId: box, centerId: dir });
  plans.payPlan(p, 150_00, { cashboxId: box, at: at(8) });
  // корректировка учёта кассы
  cash.adjustCashbox(box, cash.cashBalances().get(box)! - 30_00, "пересчёт");

  const expected = 500_00 + 250_00 + 100_00 + 70_00 + 150_00;
  const byCat = cats.spendByCategory(new Date(y, m, 1).toISOString(), new Date(y, m + 1, 1).toISOString()).reduce((a, c) => a + Number(c.spent), 0);
  const stats = repo.centerStats();
  const byCenter = [...stats.values()].filter((c) => !c.parent_id).reduce((a, c) => a + c.spent, 0);
  const monthly = repo.monthlyTotals(1)[0].expense;
  const rAll = report.buildReport({ kind: "all" }, first, last);
  assert.equal(byCat, expected, "Траты по категориям");
  assert.equal(byCenter, expected, "Траты по направлениям");
  assert.equal(monthly, expected, "Итоги месяца");
  assert.equal(rAll.expense, expected, "Отчёт «все деньги»");

  // Касса: было + пришло − ушло ± корректировки = осталось, и равно остатку на экране кассы.
  const r = report.buildReport({ kind: "cash", id: box }, first, last);
  const f = r.cashFlow!;
  assert.equal(r.cash!.start + f.in - f.out + f.adjust, r.cash!.end, "отчёт кассы сходится");
  assert.equal(r.cash!.end, cash.cashBalances().get(box), "отчёт = экран кассы");
  // наличные: 1000 −250 −100 +2000 +300 −150 −30
  assert.equal(cash.cashBalances().get(box), 1_000_00 - 250_00 - 100_00 + 2_000_00 + 300_00 - 150_00 - 30_00);
  // Перевод: сумма двух половин = 0
  const tsum = getDb().prepare("SELECT SUM(amount) AS s FROM transactions WHERE kind = 'internal' AND counterparty = 'Перевод'").get() as { s: number };
  assert.equal(Number(tsum.s), 0, "перевод не создаёт и не теряет деньги");
});
