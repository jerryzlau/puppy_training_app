"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const OFFLINE_MS = 10_000;

type CamStatus = "connecting" | "live" | "offline";

/** One detection from the Pi, coords as fractions of the frame (VISION-PLAN.md). */
interface CamBox {
  cls: "dog" | "cat" | "person";
  conf: number;
  x: number;
  y: number;
  w: number;
  h: number;
  track: number;
}

const BOX_STYLE: Record<CamBox["cls"], { color: string; label: string }> = {
  dog: { color: "#F2A33A", label: "🐶 dog" },
  person: { color: "#4FA3FF", label: "🧍 person" },
  cat: { color: "#B57BFF", label: "🐱 cat" },
};
const BOXES_PREF = "biru.cam.boxes";

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
async function readFrames(body: ReadableStream<Uint8Array>, onFrame: (jpeg: Blob, boxes: CamBox[]) => void) {
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
      let boxes: CamBox[] = [];
      const det = /x-detections:\s*(.*)/i.exec(headers)?.[1];
      if (det) {
        try {
          boxes = JSON.parse(det) as CamBox[];
        } catch {
          /* a frame without boxes is still a frame */
        }
      }
      onFrame(new Blob([buf.slice(start, start + len)], { type: "image/jpeg" }), boxes);
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
  const [boxes, setBoxes] = useState<CamBox[]>([]);
  const [showBoxes, setShowBoxes] = useState(true);
  useEffect(() => {
    try {
      setShowBoxes(localStorage.getItem(BOXES_PREF) !== "off");
    } catch {
      /* storage unavailable — boxes stay on */
    }
  }, []);
  function toggleBoxes() {
    setShowBoxes((on) => {
      try {
        localStorage.setItem(BOXES_PREF, on ? "off" : "on");
      } catch {
        /* not remembered, still toggled */
      }
      return !on;
    });
  }
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
        await readFrames(res.body, (jpeg, frameBoxes) => {
          const url = URL.createObjectURL(jpeg);
          setSrc(url);
          setBoxes(frameBoxes);
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
        {status === "live" &&
          showBoxes &&
          boxes.map((b) => {
            const style = BOX_STYLE[b.cls];
            if (!style) return null;
            return (
              <div
                key={`${b.cls}-${b.track}`}
                className="absolute rounded-sm pointer-events-none transition-all duration-100 ease-linear"
                style={{
                  left: `${b.x * 100}%`,
                  top: `${b.y * 100}%`,
                  width: `${b.w * 100}%`,
                  height: `${b.h * 100}%`,
                  border: `2.5px solid ${style.color}`,
                  boxShadow: "0 0 0 1px rgba(0,0,0,.35)",
                }}
              >
                <span
                  className="absolute left-[-2.5px] whitespace-nowrap px-1.5 py-[1px] text-[11px] font-bold text-white rounded-sm"
                  // label above the box, or tucked inside when the box touches the top edge
                  style={{ background: style.color, ...(b.y < 0.06 ? { top: 0 } : { bottom: "100%" }) }}
                >
                  {style.label} {Math.round(b.conf * 100)}%
                </span>
              </div>
            );
          })}
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
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleBoxes}
            aria-pressed={showBoxes}
            className={`min-h-[32px] px-2 rounded border ${showBoxes ? "border-ink text-ink" : "border-ruled text-inkFaint"}`}
          >
            {showBoxes ? "▣ boxes on" : "▢ boxes off"}
          </button>
          <span className="text-inkFaint hidden sm:inline">only your household can see this · nothing is recorded</span>
        </span>
      </div>
    </div>
  );
}
