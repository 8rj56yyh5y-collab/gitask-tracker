"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addItemAction, deleteItemAction, updateItemAction } from "../actions.ts";
import type { ShoppingItem } from "@/lib/shopping.ts";

const UNITS = ["шт", "кг", "г", "л", "мл", "уп"];
const money = (kop: number) => `${(kop / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₴`;
const qtyText = (i: Pick<ShoppingItem, "qty" | "unit">) => (i.qty ? `${i.qty.toLocaleString("ru-RU")} ${i.unit || "шт"}` : "");
const key = (n: string) => n.trim().toLocaleLowerCase("ru").replace(/ё/g, "е");

/** Список в магазине: нажал — купил; цену и количество можно вписать прямо в строке. */
export function ShoppingEditor({
  listId,
  initial,
  hints,
  readOnly,
}: {
  listId: number;
  initial: ShoppingItem[];
  hints: Record<string, { price: number; qty: number | null; unit: string }>;
  readOnly?: boolean;
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
    start(async () => {
      setItems(await addItemAction(listId, t));
      router.refresh();
      input.current?.focus();
    });
  };

  const todo = items.filter((i) => !i.bought);
  const done = items.filter((i) => i.bought);
  const sum = done.reduce((a, i) => a + (i.price ?? 0), 0);

  const row = (i: ShoppingItem) => {
    const h = hints[key(i.name)];
    const isOpen = open === i.id;
    return (
      <li key={i.id} className={`shop-item ${i.bought ? "is-bought" : ""} ${isOpen ? "is-open" : ""}`}>
        <div className="shop-row">
          <button
            type="button"
            className="shop-check"
            aria-label={i.bought ? `Вернуть «${i.name}» в список` : `Купил «${i.name}»`}
            disabled={readOnly}
            onClick={() => patch(i.id, { bought: i.bought ? 0 : 1 }, { bought: !i.bought })}
          >
            {i.bought ? "✓" : ""}
          </button>
          <button type="button" className="shop-main" onClick={() => !readOnly && setOpen(isOpen ? null : i.id)}>
            <span className="shop-name">{i.name}</span>
            <span className="shop-sub">
              {qtyText(i)}
              {!i.price && h && !i.bought && <span className="shop-hint">{qtyText(i) ? " · " : ""}в прошлый раз {money(h.price)}{h.qty ? ` за ${qtyText(h)}` : ""}</span>}
            </span>
          </button>
          <span className={`shop-price ${i.price ? "" : "is-empty"}`} onClick={() => !readOnly && setOpen(i.id)}>
            {i.price ? money(i.price) : readOnly ? "" : "цена"}
          </span>
        </div>
        {isOpen && !readOnly && (
          <div className="shop-edit">
            <label>
              Цена, ₴
              <input
                inputMode="decimal"
                defaultValue={i.price ? i.price / 100 : ""}
                placeholder={h ? String(h.price / 100) : "0"}
                autoFocus
                onBlur={(e) => {
                  const v = e.currentTarget.value.trim();
                  const kop = v ? Math.round(Number(v.replace(",", ".").replace(/\s/g, "")) * 100) : null;
                  if ((kop ?? null) !== (i.price ?? null)) patch(i.id, { price: kop && kop > 0 ? kop : null, bought: kop ? 1 : i.bought }, { price: v || null, bought: kop ? true : undefined });
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
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(null)}>
                Готово
              </button>
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
                Удалить
              </button>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="shop">
      {!readOnly && (
        <form
          className="shop-add"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            placeholder="Добавить: «Яйца 10 шт», «Фарш 0,5 кг»"
            aria-label="Добавить товар"
            enterKeyHint="done"
          />
          <button className="btn btn-primary" aria-label="Добавить">
            +
          </button>
        </form>
      )}
      {items.length === 0 && <p className="muted small" style={{ textAlign: "center" }}>Список пуст. Впишите первый товар.</p>}
      {todo.length > 0 && <ul className="shop-list">{todo.map(row)}</ul>}
      {done.length > 0 && (
        <>
          <div className="shop-done-title">
            В корзине · {done.length}
            {sum > 0 && <b> · {money(sum)}</b>}
          </div>
          <ul className="shop-list">{done.map(row)}</ul>
        </>
      )}
    </div>
  );
}
