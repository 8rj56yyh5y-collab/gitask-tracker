"use client";
import { useEffect } from "react";

/** Открывает раскрывающийся блок, на который ведёт ссылка с #якорем (например, /settings#telegram). */
export function HashOpen() {
  useEffect(() => {
    const open = () => {
      const el = document.getElementById(location.hash.slice(1));
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ block: "start" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
