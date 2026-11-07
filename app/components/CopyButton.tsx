"use client";
import { useState } from "react";

/** Кнопка «Скопировать»: копирует текст одним нажатием (на iPhone — в буфер обмена). */
export function CopyButton({ text, label = "Скопировать" }: { text: string; label?: string }) {
  const [done, setDone] = useState<"" | "ok" | "fail">("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone("ok");
    } catch {
      setDone("fail");
    }
    setTimeout(() => setDone(""), 2500);
  }
  return (
    <button type="button" className="btn btn-primary" onClick={copy} style={{ width: "100%" }}>
      {done === "ok" ? "✓ Скопировано" : done === "fail" ? "Не вышло — выделите текст выше и скопируйте" : label}
    </button>
  );
}
