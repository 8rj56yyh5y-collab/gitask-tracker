import { getDb } from "./db.ts";
import { getSetting, setSetting } from "./settings.ts";

// Простой режим: трата = сумма, категория, комментарий. Без «чьих денег», касс, чужих денег, продаж.
// Расширенный — всё, как было. Человек может переключить в «Настройках».

export type UiMode = "simple" | "full";

/**
 * Режим, если человек его не выбирал: простой, пока все траты — только личные.
 * Кто уже записывает траты отдела, работы и т.п., — сразу в расширенном, чтобы ничего не пропало.
 */
export function autoMode(): UiMode {
  const r = getDb()
    .prepare(
      `SELECT COUNT(DISTINCT t.cost_center_id) AS n FROM transactions t JOIN cost_centers c ON c.id = t.cost_center_id
       WHERE c.is_internal = 0 AND c.is_personal = 0 AND t.occurred_at >= ?`,
    )
    .get(new Date(Date.now() - 180 * 864e5).toISOString()) as { n: number };
  const boxes = getDb().prepare("SELECT COUNT(*) AS n FROM cashboxes WHERE archived = 0").get() as { n: number };
  return Number(r.n) > 0 || Number(boxes.n) > 0 ? "full" : "simple";
}

export function uiMode(): UiMode {
  const v = getSetting("ui_mode");
  return v === "simple" || v === "full" ? v : autoMode();
}

export const isSimple = () => uiMode() === "simple";

export function setUiMode(m: UiMode) {
  setSetting("ui_mode", m);
}

/** Направление «мои деньги» для простого режима: первое личное (или первое обычное). */
export function personalCenterId(): number | null {
  const r = (getDb().prepare("SELECT id FROM cost_centers WHERE is_personal = 1 AND archived = 0 AND is_internal = 0 ORDER BY id LIMIT 1").get() ??
    getDb().prepare("SELECT id FROM cost_centers WHERE archived = 0 AND is_internal = 0 ORDER BY id LIMIT 1").get()) as { id: number } | undefined;
  return r ? Number(r.id) : null;
}
