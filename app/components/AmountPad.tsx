"use client";
import { useEffect, useState } from "react";

/**
 * Сумма своими кнопками, как в калькуляторе: телефонная клавиатура не выезжает и не закрывает форму.
 * На компьютере можно просто печатать цифры. Значение уходит в форму скрытым полем name.
 * children — то, что стоит между суммой и кнопками (категория, комментарий).
 */
export function AmountPad({ name = "amount", label = "Сумма", children }: { name?: string; label?: string; children?: React.ReactNode }) {
  const [v, setV] = useState("");
  const press = (k: string) =>
    setV((cur) => {
      if (k === "del") return cur.slice(0, -1);
      if (k === ",") return cur.includes(",") ? cur : (cur || "0") + ",";
      const [int, frac] = cur.split(",");
      if (frac !== undefined && frac.length >= 2) return cur;
      if (frac === undefined && int.length >= 8) return cur;
      if (k === "000") return cur && !cur.includes(",") && int.length <= 5 ? cur + "000" : cur;
      if (cur === "0") return k;
      return cur + k;
    });
  // Компьютер: цифры, запятая/точка и Backspace — с клавиатуры, если курсор не в текстовом поле.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "," || e.key === ".") press(",");
      else if (e.key === "Backspace") press("del");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const shown = v ? (() => {
    const [i, f] = v.split(",");
    return `${Number(i || 0).toLocaleString("ru-RU")}${f !== undefined ? `,${f}` : ""}`;
  })() : "0";
  return (
    <div className="pad">
      <div className={`pad-display ${v ? "" : "is-empty"}`} aria-live="polite" aria-label={`${label}: ${shown} гривен`}>
        <span className="num">{shown}</span> <small>₴</small>
      </div>
      {/* Обычное поле: валидация формы и сабмит по Enter работают как раньше. */}
      <input className="pad-hidden" name={name} value={v.replace(",", ".")} required onChange={() => {}} tabIndex={-1} aria-hidden onInvalid={(e) => e.currentTarget.setCustomValidity("Наберите сумму")} onInput={(e) => e.currentTarget.setCustomValidity("")} />
      {children}
      <div className="pad-keys">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "del"].map((k) => (
          <button key={k} type="button" className="pad-key" onClick={() => press(k)} aria-label={k === "del" ? "Стереть" : k === "," ? "Копейки" : k}>
            {k === "del" ? "⌫" : k}
          </button>
        ))}
      </div>
    </div>
  );
}
