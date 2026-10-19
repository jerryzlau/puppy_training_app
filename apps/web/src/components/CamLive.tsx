"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const OFFLINE_MS = 10_000;

type CamStatus = "connecting" | "live" | "offline";

const enc = new TextEncoder();
const HEADER_END = enc.encode("\r\n\r\n");

function indexOf(buf: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= buf.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (buf[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/**
 * Read GET /cam/:id/stream (multipart/x-mixed-replace of JPEGs) through fetch,
 * so it can carry the Bearer token — an <img src> can't. Each part's
 * Content-Length says where the JPEG ends.
 */
async function readFrames(body: ReadableStream<Uint8Array>, onFrame: (jpeg: Blob) => void) {
  const reader = body.getReader();
  let buf: Uint8Array = new Uint8Array(0);
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    const next = new Uint8Array(buf.length + value.length);
    next.set(buf);
    next.set(value, buf.length);
    buf = next;
    for (;;) {
      const headerEnd = indexOf(buf, HEADER_END);
      if (headerEnd < 0) break;
      const headers = new TextDecoder().decode(buf.subarray(0, headerEnd));
      const len = Number(/content-length:\s*(\d+)/i.exec(headers)?.[1]);
      const start = headerEnd + HEADER_END.length;
      if (!len) {
        buf = buf.slice(start); // malformed part — skip its header
        continue;
      }
      if (buf.length < start + len) break; // wait for the rest of this frame
      onFrame(new Blob([buf.slice(start, start + len)], { type: "image/jpeg" }));
      buf = buf.slice(start + len);
    }
  }
}

/**
 * The live view from a Biru Cam, relayed through the API. The Pi only sends
 * frames while this is open, so it disconnects whenever the tab is hidden.
 */
export function CamLive({ deviceId }: { deviceId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<CamStatus>("connecting");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!visible) return;
    let stopped = false;
    let controller: AbortController | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let lastUrl: string | null = null;
    let lastFrameAt = 0;
    setStatus("connecting");

    const watchdog = setInterval(() => {
      if (lastFrameAt && Date.now() - lastFrameAt > OFFLINE_MS) setStatus("offline");
    }, 1000);
    // no first frame within the window → the camera isn't answering
    const firstFrame = setTimeout(() => {
      if (!lastFrameAt) setStatus("offline");
    }, OFFLINE_MS);

    async function connect() {
      if (stopped) return;
      controller = new AbortController();
      try {
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("no session");
        const res = await fetch(`${API}/cam/${deviceId}/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok || !res.body) throw new Error(`cam: ${res.status}`);
        await readFrames(res.body, (jpeg) => {
          const url = URL.createObjectURL(jpeg);
          setSrc(url);
          if (lastUrl) URL.revokeObjectURL(lastUrl);
          lastUrl = url;
          lastFrameAt = Date.now();
          setStatus("live");
        });
      } catch {
        /* fall through to retry */
      }
      if (!stopped) retry = setTimeout(connect, 3000);
    }
    void connect();

    return () => {
      stopped = true;
      controller?.abort();
      if (retry) clearTimeout(retry);
      clearInterval(watchdog);
      clearTimeout(firstFrame);
      if (lastUrl) URL.revokeObjectURL(lastUrl);
    };
  }, [deviceId, visible]);

  return (
    <div className="mt-3 rounded-lg border-2 border-ink bg-white shadow-sketchSoft overflow-hidden md:max-w-[640px]">
      <div className="relative aspect-video bg-ink/90">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element -- blob: frames, not an optimisable image
          <img src={src} alt="live view from the camera" className="w-full h-full object-contain" />
        )}
        {status !== "live" && (
          <div className="absolute inset-0 flex items-center justify-center text-cream text-sm font-bold">
            {status === "connecting" ? "waking the camera…" : "camera offline — is it plugged in?"}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-[11px] font-bold">
        <span className={status === "live" ? "text-accent" : "text-inkFaint"}>
          {status === "live" ? "● live" : status === "offline" ? "○ offline" : "○ connecting"}
        </span>
        <span className="text-inkFaint">only your household can see this · nothing is recorded</span>
      </div>
    </div>
  );
}
