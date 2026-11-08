"use client";
import { useEffect, useRef } from "react";

/**
 * Выбрали кассу, у которой есть своё направление («Касса отдела» → «Отдел продаж»),
 * а направление ещё не выбрано — подставляем его. Выбранное вручную не трогаем.
 */
export function CashCenterLink() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.name !== "account" || !t.checked || !t.dataset.center) return;
      if (form.querySelector('input[name="centerId"]:checked')) return;
      const c = form.querySelector<HTMLInputElement>(`input[name="centerId"][value="${t.dataset.center}"]`);
      if (c) c.checked = true;
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, []);
  return <span ref={ref} hidden />;
}
