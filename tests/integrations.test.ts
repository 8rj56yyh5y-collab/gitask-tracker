import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.DN_DB_PATH = ":memory:";
process.env.TZ = "Europe/Kyiv";

// Поддельные серверы Telegram и Monobank: записываем все вызовы.
const calls: { path: string; body: any; headers: http.IncomingHttpHeaders }[] = [];
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : null;
    calls.push({ path: req.url!, body, headers: req.headers });
    res.setHeader("Content-Type", "application/json");
    if (req.url!.endsWith("/getMe")) return res.end(JSON.stringify({ ok: true, result: { username: "dn_test_bot" } }));
    if (req.url!.startsWith("/bot")) return res.end(JSON.stringify({ ok: true, result: true }));
    if (req.url === "/personal/client-info") {
      if (req.headers["x-token"] !== "mono-token-1234567890abcdef") return res.writeHead(403).end("{}");
      return res.end(
        JSON.stringify({
          name: "Тест Тестович",
          accounts: [
            { id: "acc-black", maskedPan: ["537541******4444"], type: "black", currencyCode: 980 },
            { id: "acc-fop", maskedPan: ["444111******5555"], type: "fop", currencyCode: 980 },
            { id: "jar", maskedPan: [], type: "black" },
          ],
        }),
      );
    }
    if (req.url === "/personal/webhook") return res.end("{}");
    const st = req.url!.match(/^\/personal\/statement\/([^/]+)\/(\d+)\/(\d+)$/);
    if (st) {
      const [, acc, from, to] = st;
      // Две операции: одна внутри запрошенного периода, одна — до него (банк её не вернёт).
      const items = [
        { id: `${acc}-old`, time: Number(from) - 3600, amount: -50000, description: "До даты", currencyCode: 980 },
        { id: `${acc}-in`, time: Number(from) + 3600, amount: -120000, description: "АТБ", currencyCode: 980 },
      ].filter((i) => i.time >= Number(from) && i.time <= Number(to));
      return res.end(JSON.stringify(items));
    }
    res.writeHead(404).end("{}");
  });
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
process.env.DN_TELEGRAM_API = base;
process.env.DN_MONO_API = base;
process.env.DN_MONO_PAUSE_MS = "0";
after(() => server.close());

const repo = await import("../lib/repo.ts");
const tg = await import("../lib/telegram.ts");
const { setSetting, getSetting } = await import("../lib/settings.ts");
const { connectMonobank, saveMonoItem, backfill } = await import("../lib/monobank.ts");
const center = (name: string) => repo.listCenters().find((c) => c.name.startsWith(name))!;

test("telegram: connect, link chat by code, notify, assign by button", async () => {
  const bot = await tg.connectTelegram("123:abc", "https://dn.example.com");
  assert.equal(bot, "dn_test_bot");
  const hook = calls.find((c) => c.path.endsWith("/setWebhook"))!;
  assert.equal(hook.body.url, "https://dn.example.com/api/telegram");
  assert.ok(hook.body.secret_token.length >= 32);

  // чужой код не привязывает
  await tg.handleUpdate({ message: { chat: { id: 999 }, text: "/start 000000" } });
  assert.equal(getSetting("tg_chat_id"), null);
  const code = tg.telegramState().linkCode!;
  await tg.handleUpdate({ message: { chat: { id: 42 }, text: `/start ${code}` } });
  assert.equal(getSetting("tg_chat_id"), "42");
  assert.equal(tg.telegramState().linkCode, null);

  // новая операция → сообщение с кнопками
  const { id } = repo.insertTx({ amountKop: -125000, source: "applepay", counterparty: "OKKO" });
  calls.length = 0;
  await tg.notifyNewTx(id);
  const sent = calls.find((c) => c.path.endsWith("/sendMessage"))!;
  assert.equal(sent.body.chat_id, "42");
  assert.match(sent.body.text, /OKKO/);
  const buttons = sent.body.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b: any) => b.callback_data === `m:${id}`));

  // «Все категории…» показывает весь список
  calls.length = 0;
  await tg.handleUpdate({ callback_query: { id: "q1", data: `m:${id}`, message: { chat: { id: 42 }, message_id: 7 } } });
  const kb = calls.find((c) => c.path.endsWith("/editMessageReplyMarkup"))!.body.reply_markup.inline_keyboard.flat();
  const sales = center("Отдел продаж");
  assert.ok(kb.some((b: any) => b.callback_data === `a:${id}:${sales.id}`));

  // нажатие из чужого чата ничего не меняет
  await tg.handleUpdate({ callback_query: { id: "q2", data: `a:${id}:${sales.id}`, message: { chat: { id: 999 }, message_id: 7 } } });
  assert.equal(repo.getTx(id)!.cost_center_id, null);

  // нажатие кнопки категории записывает операцию
  calls.length = 0;
  await tg.handleUpdate({ callback_query: { id: "q3", data: `a:${id}:${sales.id}`, message: { chat: { id: 42 }, message_id: 7 } } });
  assert.equal(repo.getTx(id)!.cost_center_id, sales.id);
  assert.match(calls.find((c) => c.path.endsWith("/editMessageText"))!.body.text, /Записано/);

  // уже разнесённая операция повторно не уведомляется
  calls.length = 0;
  await tg.notifyNewTx(id);
  assert.equal(calls.length, 0);
});

test("telegram: notify is skipped silently when not linked", async () => {
  setSetting("tg_chat_id", null);
  const { id } = repo.insertTx({ amountKop: -1000, source: "sms" });
  calls.length = 0;
  await tg.notifyNewTx(id);
  assert.equal(calls.length, 0);
});

test("monobank: bad token gives a clear error", async () => {
  await assert.rejects(connectMonobank("wrong-token-xxxxxxxxxxxx", "https://dn.example.com/api/monobank?key=k"), /не принял токен/);
});

test("monobank: adds cards, links existing by last 4 digits, registers webhook", async () => {
  repo.createCard({ bank: "Monobank", last4: "5555", owner: "я", kind: "fop", monthly_limit: 0, mono_account_id: null });
  calls.length = 0;
  const r = await connectMonobank("mono-token-1234567890abcdef", "https://dn.example.com/api/monobank?key=k");
  assert.deepEqual([r.added, r.linked], [1, 1]);
  assert.equal(repo.findCard({ monoAccount: "acc-black" })!.last4, "4444");
  assert.equal(repo.findCard({ monoAccount: "acc-fop" })!.last4, "5555");
  assert.equal(repo.listCards().filter((c) => c.last4 === "5555").length, 1);
  assert.equal(calls.find((c) => c.path === "/personal/webhook")!.body.webHookUrl, "https://dn.example.com/api/monobank?key=k");
});

test("monobank: operations before the tracking date are skipped", async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const r = await connectMonobank("mono-token-1234567890abcdef", "https://dn.example.com/api/monobank?key=k", { from: today });
  assert.equal(r.backfillAccounts, 0, "no backfill unless asked");
  const card = repo.findCard({ monoAccount: "acc-black" })!;
  assert.equal(card.track_from, today.toISOString());
  const yesterday = Math.floor(today.getTime() / 1000) - 3600;
  assert.equal(saveMonoItem("acc-black", { id: "old-1", time: yesterday, amount: -1000 }), null);
  const fresh = saveMonoItem("acc-black", { id: "new-1", time: Math.floor(Date.now() / 1000), amount: -2000, description: "OKKO" });
  assert.ok(fresh && !fresh.duplicate);
  assert.equal(repo.getTx(fresh!.id)!.card_id, card.id);
  // повтор той же операции не дублируется
  assert.equal(saveMonoItem("acc-black", { id: "new-1", time: Math.floor(Date.now() / 1000), amount: -2000 })!.duplicate, true);
});

test("monobank: backfill from the chosen date loads past operations once", async () => {
  const from = new Date(Date.now() - 40 * 864e5); // 40 дней — по два запроса по 31 дню на счёт
  calls.length = 0;
  const r = await connectMonobank("mono-token-1234567890abcdef", "https://dn.example.com/api/monobank?key=k", { from, backfill: true, wait: true });
  assert.equal(r.backfillAccounts, 2);
  const statementCalls = calls.filter((c) => c.path.startsWith("/personal/statement/"));
  assert.equal(statementCalls.length, 4, "2 accounts × 2 chunks of 31 days");
  assert.equal(r.backfilled, 2, "one past operation per account in range");
  assert.equal(repo.listRecent(1000).filter((t) => t.counterparty === "АТБ").length, 2);
  // повторная загрузка не создаёт дублей
  const before = repo.listRecent(1000).length;
  assert.equal(await backfill("mono-token-1234567890abcdef", ["acc-black", "acc-fop"], from, new Date()), 0);
  assert.equal(repo.listRecent(1000).length, before);
});

test("monobank: backfill is limited to the allowed depth", async () => {
  const r = await connectMonobank("mono-token-1234567890abcdef", "https://dn.example.com/api/monobank?key=k", { from: new Date(2020, 0, 1), backfill: true, wait: true });
  const days = (Date.now() - new Date(r.from).getTime()) / 864e5;
  assert.ok(days <= 92.01 && days > 91, `clamped to 92 days, got ${days}`);
});
