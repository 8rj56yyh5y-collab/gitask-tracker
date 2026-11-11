"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { scanReceiptAction } from "./actions.ts";

/** Уменьшаем фото в телефоне (до 1800 px по длинной стороне), чтобы оно быстро ушло и хорошо читалось. */
async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = fail;
      i.src = url;
    });
    const k = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("canvas"))), "image/jpeg", 0.85));
  } catch {
    return file; // не получилось уменьшить — отправим как есть
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** «📷 Чек»: сфотографировать или выбрать фото — ИИ прочитает товары и цены. */
export function ReceiptButton({ listId, big }: { listId?: number; big?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const blob = await shrink(file);
      const f = new FormData();
      f.set("photo", new File([blob], "receipt.jpg", { type: blob.type || "image/jpeg" }));
      if (listId) f.set("listId", String(listId));
      const r = await scanReceiptAction(f);
      if (r.error) setError(r.error);
      else if (r.listId) router.push(`/shopping/${r.listId}?receipt=1`);
    } catch {
      setError("Не получилось отправить фото. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => onFile(e.currentTarget.files?.[0])} />
      {big ? (
        <button type="button" className="new-list receipt-btn" onClick={() => input.current?.click()} disabled={busy}>
          <span className="new-list-plus receipt-icon" aria-hidden>
            📷
          </span>
          <span>
            <strong>Чек из магазина</strong>
            <span className="muted small">Сфотографируйте чек — ИИ сам запишет товары и цены</span>
          </span>
        </button>
      ) : (
        <button type="button" className="btn btn-sm" onClick={() => input.current?.click()} disabled={busy}>
          📷 Добавить чек
        </button>
      )}
      {error && <div className="card alert-on small receipt-error">{error}</div>}
      {busy && (
        <div className="receipt-busy" role="status" aria-live="polite">
          <div className="receipt-busy-card">
            <div className="receipt-spinner" aria-hidden />
            <strong>ИИ читает чек…</strong>
            <span className="muted small">Обычно 10–30 секунд</span>
          </div>
        </div>
      )}
    </>
  );
}
