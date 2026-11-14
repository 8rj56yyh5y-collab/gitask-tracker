"use client";
import { useEffect, useState } from "react";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * «Добавьте D&N на экран Домой» — тогда он открывается как обычное приложение, без адресной строки.
 * Только на телефоне, только пока не установлено; «Не сейчас» — больше не показываем.
 */
export function InstallHint() {
  const [mode, setMode] = useState<"ios" | "android" | null>(null);
  const [evt, setEvt] = useState<BIP | null>(null);
  useEffect(() => {
    try {
      if (localStorage.getItem("dn_install_hidden")) return;
    } catch {
      return;
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    if (standalone || window.innerWidth > 900) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (ios) setMode("ios");
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIP);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (!mode) return null;
  const hide = () => {
    try {
      localStorage.setItem("dn_install_hidden", "1");
    } catch {
      /* ничего */
    }
    setMode(null);
  };
  return (
    <section className="card install-hint">
      <span className="install-ico" aria-hidden>
        📲
      </span>
      <span className="install-text">
        <b>Сделайте D&amp;N приложением</b>
        {mode === "ios" ? (
          <span className="small">
            Нажмите «Поделиться» <span aria-hidden>⬆︎</span> внизу Safari → «На экран „Домой“». Откроется на весь экран, как обычное приложение.
          </span>
        ) : (
          <span className="small">Установите на экран телефона — откроется на весь экран, как обычное приложение.</span>
        )}
      </span>
      <span className="install-actions">
        {mode === "android" && evt && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={async () => {
              await evt.prompt();
              hide();
            }}
          >
            Установить
          </button>
        )}
        <button type="button" className="btn btn-sm btn-ghost" onClick={hide}>
          Не сейчас
        </button>
      </span>
    </section>
  );
}
