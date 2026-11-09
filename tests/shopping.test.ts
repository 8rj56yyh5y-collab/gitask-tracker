import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DN_DB_PATH = ":memory:";
process.env.TZ = "Europe/Kyiv";
const repo = await import("../lib/repo.ts");
const shop = await import("../lib/shopping.ts");
const cash = await import("../lib/cash.ts");
const cats = await import("../lib/categories.ts");

test("разбор строки товара: количество и единица", () => {
  assert.deepEqual(shop.parseItem("Яйца 10 шт"), { name: "Яйца", qty: 10, unit: "шт" });
  assert.deepEqual(shop.parseItem("Фарш телячий 0,5 кг"), { name: "Фарш телячий", qty: 0.5, unit: "кг" });
  assert.deepEqual(shop.parseItem("Молоко 2"), { name: "Молоко", qty: 2, unit: "шт" });
  assert.deepEqual(shop.parseItem("Сыр 300г"), { name: "Сыр", qty: 300, unit: "г" });
  assert.deepEqual(shop.parseItem("Хлеб"), { name: "Хлеб", qty: null, unit: "" });
});

test("список → отметки и цены → закрыть чек = расход из кассы; некупленное переносится", () => {
  const id = shop.createList("Неделя", ["Яйца 10 шт", "Фарш 0,5 кг", "Хлеб"]);
  const l = shop.getList(id)!;
  assert.equal(l.items.length, 3);
  const [eggs, mince] = l.items;
  shop.updateItem(eggs.id, { bought: true, price: 52_00 });
  shop.updateItem(mince.id, { bought: true, price: 180_00 });
  assert.equal(shop.listSum(shop.getList(id)!), 232_00);
  const box = cash.createCashbox({ name: "Домашняя", opening: 1000_00 });
  const center = repo.listCenters().find((c) => c.name === "Личные")!.id;
  const food = cats.listCategories().find((c) => c.name === "Продукты")!.id;
  const { txId, nextListId } = shop.closeList(id, { centerId: center, categoryId: food, cashboxId: box, carryOver: true });
  const tx = repo.getTx(txId)!;
  assert.equal(tx.amount, -232_00);
  assert.equal(tx.cost_center_id, center);
  assert.equal(tx.category_id, food);
  assert.equal(cash.cashBalances().get(box), 768_00, "остаток кассы уменьшился");
  assert.match(tx.description, /Яйца/);
  assert.ok(!repo.listUnassigned().some((t) => t.id === txId), "расход записан полностью");
  assert.equal(shop.getList(id)!.status, "closed");
  assert.deepEqual(shop.getList(nextListId!)!.items.map((i) => i.name), ["Хлеб"]);
  assert.throws(() => shop.closeList(id, { centerId: center }), /закрыт/);
});

test("прошлая цена и статистика по товарам", () => {
  const id = shop.createList("", ["яйца 10 шт"]);
  const item = shop.getList(id)!.items[0];
  const hint = shop.lastPrices(["Яйца"]).get("яйца")!;
  assert.equal(hint.price, 52_00);
  shop.updateItem(item.id, { bought: true, price: 60_00 });
  const center = repo.listCenters().find((c) => c.name === "Личные")!.id;
  shop.closeList(id, { centerId: center });
  const stats = shop.itemStats(new Date(Date.now() - 864e5).toISOString());
  const eggs = stats.find((s) => s.name.toLowerCase() === "яйца")!;
  assert.equal(eggs.times, 2);
  assert.equal(eggs.spent, 112_00);
  assert.equal(eggs.unit, "шт");
  assert.equal(eggs.perUnit, 560, "5,60 ₴ за штуку");
  assert.throws(() => shop.closeList(shop.createList("пустой", ["вода"]), { centerId: center }), /сумму/);
});

test("товары списка — обычные объекты (их можно отдать в браузер)", () => {
  const id = shop.createList("", ["Сок 1"]);
  const item = shop.getList(id)!.items[0];
  assert.equal(Object.getPrototypeOf(item), Object.prototype);
});

test("список можно просто закрыть без денег и открыть снова", () => {
  const before = repo.listRecent(500).length;
  const id = shop.createList("Просто список", ["Батарейки", "Лампочка"]);
  const [a] = shop.getList(id)!.items;
  shop.updateItem(a.id, { bought: true });
  const next = shop.closeListPlain(id, true);
  assert.equal(repo.listRecent(500).length, before, "расход не создаётся");
  assert.equal(shop.getList(id)!.status, "closed");
  assert.deepEqual(shop.getList(next!)!.items.map((i) => i.name), ["Лампочка"]);
  shop.reopenList(id);
  assert.equal(shop.getList(id)!.status, "open");
  // порядок товаров не меняется после отметки
  assert.deepEqual(shop.getList(id)!.items.map((i) => i.name), ["Батарейки", "Лампочка"]);
});
