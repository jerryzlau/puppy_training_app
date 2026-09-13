"use client";

import { useEffect, useRef, useState } from "react";
import type { HouseholdEvent } from "@biru/shared";
import { supabase } from "./supabase";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export type LiveStatus = "connecting" | "live" | "offline";

/**
 * Subscribe to the household's live event stream (GET /events, Server-Sent
 * Events). The browser's EventSource can't send an Authorization header, so
 * this reads the stream through fetch and does its own reconnect (backoff,
 * capped at 30 s). `onReconnect` fires after any gap so the caller can refetch
 * whatever it may have missed — the stream itself is not replayed.
 *
 * Handlers are read through a ref, so callers can pass fresh closures every
 * render without re-opening the connection.
 */
export function useHouseholdEvents(
  onEvent: (ev: HouseholdEvent) => void,
  onReconnect?: () => void,
  enabled = true
): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const handlers = useRef({ onEvent, onReconnect });
  handlers.current = { onEvent, onReconnect };

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let hadConnection = false;
    let live = false;

    async function connect() {
      if (stopped) return;
      controller = new AbortController();
      try {
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("no session");
        const res = await fetch(`${API}/events`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok || !res.body) throw new Error(`events: ${res.status}`);
        live = true;
        setStatus("live");
        attempts = 0;
        if (hadConnection) handlers.current.onReconnect?.();
        hadConnection = true;
        await readStream(res.body, (ev) => handlers.current.onEvent(ev));
      } catch {
        /* fall through to reconnect */
      }
      if (stopped) return;
      live = false;
      setStatus("offline");
      // Reconnect immediately when the tab comes back to the foreground,
      // otherwise back off: 1, 2, 4 … 30 s.
      const delay = document.visibilityState === "visible" ? Math.min(30_000, 1000 * 2 ** attempts) : 60_000;
      attempts++;
      timer = setTimeout(connect, delay);
    }

    const onVisible = () => {
      if (document.visibilityState !== "visible" || live) return;
      if (timer) clearTimeout(timer);
      attempts = 0;
      void connect();
    };
    document.addEventListener("visibilitychange", onVisible);
    void connect();

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return status;
}

/** Parse SSE frames off a byte stream and hand each JSON `data:` to `emit`. */
async function readStream(body: ReadableStream<Uint8Array>, emit: (ev: HouseholdEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data) continue; // heartbeat comment or a frame with no payload
      try {
        const ev = JSON.parse(data) as HouseholdEvent | { householdId: string };
        if ("type" in ev) emit(ev);
      } catch {
        /* ignore malformed frames */
      }
    }
  }
}
