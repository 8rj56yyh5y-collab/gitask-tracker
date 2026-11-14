"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Вход по Face ID — только внутри приложения для iPhone (на сайте в браузере ничего не меняется).

type Bio = {
  isAvailable: () => Promise<{ isAvailable: boolean }>;
  verifyIdentity: (o: { reason: string; title?: string; subtitle?: string; useFallback?: boolean; fallbackTitle?: string }) => Promise<void>;
};
type Cap = { isNativePlatform?: () => boolean; Plugins?: { NativeBiometric?: Bio } };

export const FACE_ID_KEY = "dn_faceid";
const AWAY_MS = 60_000;

/** Приложение для iPhone (оболочка Capacitor), а не сайт в Safari. */
export function inNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as { Capacitor?: Cap }).Capacitor?.isNativePlatform?.());
}

function bio(): Bio | null {
  const c = (window as unknown as { Capacitor?: Cap }).Capacitor;
  return c?.isNativePlatform?.() ? (c.Plugins?.NativeBiometric ?? null) : null;
}

function enabled(): boolean {
  try {
    return localStorage.getItem(FACE_ID_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Экран-замок поверх D&N: при запуске и после минуты в фоне. */
export function AppLock() {
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    const b = bio();
    if (!b) return setLocked(false);
    setBusy(true);
    try {
      await b.verifyIdentity({ reason: "Откройте D&N", title: "D&N", useFallback: true, fallbackTitle: "Ввести код-пароль" });
      setLocked(false);
    } catch {
      /* отменили — остаёмся на замке, можно нажать ещё раз */
    } finally {
      setBusy(false);
    }
  }, []);

  useLayoutEffect(() => {
    const b = bio();
    if (!b || !enabled()) return;
    setLocked(true);
    b.isAvailable()
      .then((r) => (r.isAvailable ? unlock() : setLocked(false)))
      .catch(() => setLocked(false));
  }, [unlock]);

  useEffect(() => {
    const onVis = () => {
      if (!bio() || !enabled()) return;
      if (document.visibilityState === "hidden") hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > AWAY_MS) {
        setLocked(true);
        void unlock();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [unlock]);

  if (!locked) return null;
  return (
    <div className="app-lock" role="dialog" aria-modal="true" aria-label="D&N заблокирован">
      <div className="app-lock-box">
        <img src="/icon-192.png" alt="" width={84} height={84} />
        <strong>D&amp;N</strong>
        <button type="button" className="btn btn-primary btn-big" onClick={unlock} disabled={busy}>
          {busy ? "…" : "Открыть по Face ID"}
        </button>
      </div>
    </div>
  );
}

/** Переключатель в «Настройках» — виден только в приложении для iPhone. */
export function FaceIdToggle() {
  const [native, setNative] = useState(false);
  const [on, setOn] = useState(true);
  useEffect(() => {
    setNative(Boolean(bio()));
    setOn(enabled());
  }, []);
  if (!native) return null;
  const flip = () => {
    const next = !on;
    try {
      localStorage.setItem(FACE_ID_KEY, next ? "on" : "off");
    } catch {
      /* ничего */
    }
    setOn(next);
  };
  return (
    <section className="card row-between faceid-row">
      <span>
        <strong>🔒 Вход по Face ID</strong>
        <span className="muted small"> — D&amp;N спросит Face ID при открытии и после минуты в фоне</span>
      </span>
      <button type="button" className="btn btn-sm" onClick={flip} aria-pressed={on}>
        {on ? "Выключить" : "Включить"}
      </button>
    </section>
  );
}
