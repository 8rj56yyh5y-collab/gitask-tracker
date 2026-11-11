"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addItemAction, deleteItemAction, updateItemAction } from "../actions.ts";
import type { ShoppingItem } from "@/lib/shopping.ts";
import { groupById } from "@/lib/groups.ts";

const UNITS = ["шт", "кг", "г", "л", "мл", "уп"];
const money = (kop: number) =>
  `${(kop / 100).toLocaleString("ru-RU", { minimumFractionDigits: kop % 100 ? 2 : 0, maximumFractionDigits: 2 })} ₴`;
const qtyText = (i: Pick<ShoppingItem, "qty" | "unit">) => (i.qty ? `${i.qty.toLocaleString("ru-RU")} ${i.unit || "шт"}` : "");
const key = (n: string) => n.trim().toLocaleLowerCase("ru").replace(/ё/g, "е");

/**
 * Список как в заметках: нажал на кружок — товар куплен (кружок зелёный, строка зачёркнута), порядок не меняется.
 * Цена и количество — по желанию, через тихий значок ₴.
 */
export function ShoppingEditor({
  listId,
  initial,
  hints,
  readOnly,
  autoFocus,
}: {
  listId: number;
  initial: ShoppingItem[];
  hints: Record<string, { price: number; qty: number | null; unit: string }>;
  readOnly?: boolean;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const patch = (id: number, d: Partial<ShoppingItem>, server: Parameters<typeof updateItemAction>[1]) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...d } : i)));
    start(async () => {
      await updateItemAction(id, server);
      router.refresh();
    });
  };

  const add = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    input.current?.focus();
    start(async () => {
      setItems(await addItemAction(listId, t));
      router.refresh();
    });
  };

  const bought = items.filter((i) => i.bought).length;
  const sum = items.filter((i) => i.bought).reduce((a, i) => a + (i.price ?? 0), 0);

  return (
    <div className="shop">
      {items.length > 0 && (
        <div className="shop-progress">
          <div className="row-between">
            <span>
              Куплено <b>{bought}</b> из {items.length}
            </span>
            {sum > 0 && <b>{money(sum)}</b>}
          </div>
          <span className="shop-progress-track">
            <i style={{ width: `${(bought / items.length) * 100}%` }} />
          </span>
        </div>
      )}

      <ul className="shop-list">
        {items.map((i) => {
          const h = hints[key(i.name)];
          const isOpen = open === i.id;
          return (
            <li key={i.id} className={`shop-item ${i.bought ? "is-bought" : ""}`}>
              <div className="shop-row">
                <button
                  type="button"
                  className="shop-check"
                  aria-pressed={Boolean(i.bought)}
                  aria-label={i.bought ? `Снять отметку: ${i.name}` : `Купил: ${i.name}`}
                  disabled={readOnly}
                  onClick={() => patch(i.id, { bought: i.bought ? 0 : 1 }, { bought: !i.bought })}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                    <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <span
                  className="shop-main"
                  onClick={() => !readOnly && patch(i.id, { bought: i.bought ? 0 : 1 }, { bought: !i.bought })}
                >
                  <span className="shop-name">
                    {groupById(i.grp)?.emoji && <span className="shop-grp" title={groupById(i.grp)!.name}>{groupById(i.grp)!.emoji} </span>}
                    {i.name}
                  </span>
                  {qtyText(i) && <span className="shop-qty">{qtyText(i)}</span>}
                </span>
                {i.price ? (
                  <button type="button" className="shop-price" onClick={() => !readOnly && setOpen(isOpen ? null : i.id)}>
                    {money(i.price)}
                  </button>
                ) : (
                  !readOnly && (
                    <button type="button" className="shop-money" aria-label={`Цена и количество: ${i.name}`} onClick={() => setOpen(isOpen ? null : i.id)}>
                      ₴
                    </button>
                  )
                )}
              </div>
              {isOpen && !readOnly && (
                <div className="shop-edit">
                  {h && (
                    <span className="shop-hint">
                      В прошлый раз: {money(h.price)}
                      {h.qty ? ` за ${qtyText(h)}` : ""}
                    </span>
                  )}
                  <label>
                    Цена, ₴
                    <input
                      inputMode="decimal"
                      defaultValue={i.price ? i.price / 100 : ""}
                      placeholder={h ? String(h.price / 100) : "необязательно"}
                      autoFocus
                      onBlur={(e) => {
                        const v = e.currentTarget.value.trim();
                        const kop = v ? Math.round(Number(v.replace(",", ".").replace(/\s/g, "")) * 100) : null;
                        if ((kop ?? null) !== (i.price ?? null)) patch(i.id, { price: kop && kop > 0 ? kop : null }, { price: v || null });
                      }}
                    />
                  </label>
                  <label>
                    Сколько
                    <input
                      inputMode="decimal"
                      defaultValue={i.qty ?? ""}
                      placeholder="1"
                      onBlur={(e) => {
                        const q = Number(e.currentTarget.value.replace(",", ".")) || null;
                        if (q !== i.qty) patch(i.id, { qty: q, unit: q ? i.unit || "шт" : "" }, { qty: q, unit: q ? i.unit || "шт" : "" });
                      }}
                    />
                  </label>
                  <label>
                    Ед.
                    <select defaultValue={i.unit || "шт"} onChange={(e) => patch(i.id, { unit: e.currentTarget.value }, { unit: e.currentTarget.value })}>
                      {UNITS.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </label>
                  <div className="shop-edit-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost danger"
                      onClick={() => {
                        setItems((l) => l.filter((x) => x.id !== i.id));
                        setOpen(null);
                        start(async () => {
                          await deleteItemAction(i.id);
                          router.refresh();
                        });
                      }}
                    >
                      Удалить товар
                    </button>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(null)}>
                      Готово
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {!readOnly && (
          <li className="shop-item shop-new">
            <form
              className="shop-row"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <span className="shop-plus" aria-hidden>
                +
              </span>
              <input
                ref={input}
                value={text}
                autoFocus={autoFocus}
                onChange={(e) => setText(e.currentTarget.value)}
                placeholder={items.length ? "Ещё товар" : "Что купить? Например: Яйца 10 шт"}
                aria-label="Добавить товар"
                enterKeyHint="next"
              />
              {text.trim() && <button className="btn btn-sm btn-primary">Добавить</button>}
            </form>
          </li>
        )}
      </ul>
      {!readOnly && items.length > 0 && items.length < 4 && (
        <p className="muted small" style={{ textAlign: "center", margin: "4px 0 0" }}>
          Нажмите на товар, чтобы отметить. ₴ — цена, если хотите считать деньги.
        </p>
      )}
    </div>
  );
}
