"use client";

import { useEffect } from "react";

const IDLE_MINUTES = Number(process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES) || 30;
const IDLE_MS = IDLE_MINUTES * 60 * 1000;
const EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "visibilitychange"];

export function IdleLogout() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const logout = async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        // ignore
      }
      window.location.href = "/login?timeout=1";
    };

    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(logout, IDLE_MS);
    };

    reset();
    for (const ev of EVENTS) {
      window.addEventListener(ev, reset, { passive: true });
    }

    return () => {
      if (timer) clearTimeout(timer);
      for (const ev of EVENTS) {
        window.removeEventListener(ev, reset);
      }
    };
  }, []);

  return null;
}
