"use client";

import { useEffect } from "react";

/** Registers the service worker that makes the app installable. */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Registering after load keeps it off the critical path.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* an unavailable SW must never break the app */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
