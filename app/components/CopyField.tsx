"use client";
import { useState } from "react";

/** Поле только для чтения с кнопкой «Скопировать»: нажатие на поле выделяет весь текст. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  const [state, setState] = useState<"" | "ok" | "fail">("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("ok");
    } catch {
      setState("fail");
    }
    setTimeout(() => setState(""), 2000);
  }
  return (
    <div className="copy-field">
      {value.includes("\n") ? (
        <textarea readOnly value={value} aria-label={label} rows={value.split("\n").length} onFocus={(e) => e.currentTarget.select()} />
      ) : (
        <input readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} onClick={(e) => e.currentTarget.select()} />
      )}
      <button type="button" className="btn btn-sm copy-btn" onClick={copy} aria-label={`Скопировать${label ? ": " + label : ""}`}>
        {state === "ok" ? "✓" : state === "fail" ? "!" : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        )}
      </button>
      {state === "fail" && <span className="small danger">Не вышло — нажмите на текст, он выделится, и скопируйте.</span>}
    </div>
  );
}
