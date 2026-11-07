import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Старая база: касса «Личная касса» и направление «Личные» — после обновления касса привязывается к направлению.
const dir = mkdtempSync(join(tmpdir(), "dn-merge-"));
const file = join(dir, "dn.db");
process.env.DN_DB_PATH = file;
{
  const { getDb } = await import("../lib/db.ts");
  const db = getDb();
  db.exec("INSERT INTO cashboxes (name) VALUES ('Личная касса'), ('Касса отдела продаж'), ('Сейф')");
  db.exec("DELETE FROM settings WHERE key = 'boxes_linked'");
}

test("кассы с тем же смыслом привязываются к направлениям один раз", async () => {
  const db2 = new DatabaseSync(file);
  // повторная миграция при следующем запуске
  const mod = await import(`../lib/db.ts?again=${Date.now()}`);
  const db = mod.getDb();
  const rows = db.prepare("SELECT b.name, c.name AS center FROM cashboxes b LEFT JOIN cost_centers c ON c.id = b.center_id ORDER BY b.id").all();
  assert.equal(rows[0].center, "Личные");
  assert.equal(rows[1].center, "Отдел продаж");
  assert.equal(rows[2].center, null);
  db2.close();
});
