"use client";

// Bell in the top strip of every app page: friend pets' bathroom news.
// Polls /notifications; "seen" state is per-device (localStorage), so the
// badge counts only events newer than the last time the dropdown was opened.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { RoutineAlertDto } from "@biru/shared";

const SEEN_KEY = "biru-notif-seen";
const POLL_MS = 60_000;

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function emoji(kind: string): string {
  return /poop/i.test(kind) ? "💩" : "💛";
}

export function NotificationBell() {
  const [alerts, setAlerts] = useState<RoutineAlertDto[]>([]);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<string>(() => {
    try {
      return localStorage.getItem(SEEN_KEY) ?? new Date(0).toISOString();
    } catch {
      return new Date(0).toISOString();
    }
  });
  const panelRef = useRef<HTMLDivElement>(null);
  /** cutoff for the per-row "new" dots: seenAt as it was when the panel opened */
  const [dotCutoff, setDotCutoff] = useState<string>(seenAt);

  const load = useCallback(() => {
    api<{ alerts: RoutineAlertDto[] }>("/notifications")
      .then((r) => setAlerts(r.alerts))
      .catch(() => {
        /* the bell is never worth an error state */
      });
  }, []);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const interval = setInterval(load, POLL_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [load]);

  // close on outside tap
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const unread = alerts.filter((a) => a.happenedAt > seenAt).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setDotCutoff(seenAt);
      const now = new Date().toISOString();
      setSeenAt(now);
      try {
        localStorage.setItem(SEEN_KEY, now);
      } catch {
        /* per-visit only */
      }
    }
  }

  return (
    <div ref={panelRef} className="fixed top-1.5 right-3 z-50 md:left-[172px] md:right-auto md:top-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread ? `${unread} new notifications` : "notifications"}
        aria-expanded={open}
        className="relative w-9 h-9 rounded-full bg-white border-2 border-ink flex items-center justify-center text-base -rotate-2 shadow-sketchSoft active:opacity-70"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-0.5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center border border-ink">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 md:left-0 md:right-auto mt-2 w-[300px] max-h-[380px] overflow-y-auto bg-paper border-2 border-ink rounded-lg shadow-sketch p-3">
          <div className="font-hand text-xl mb-1">bathroom bulletin 📋</div>
          {alerts.length === 0 && (
            <p className="text-sm text-inkSoft py-2">
              all quiet — friend pets&apos; pee &amp; poop news shows up here
            </p>
          )}
          {alerts.map((a) => (
            <div
              key={a.id}
              className="flex gap-2 items-start py-2 border-b border-dashed border-ruled last:border-0"
            >
              <span className="text-lg" aria-hidden>
                {emoji(a.kind)}
              </span>
              <span className="flex-1 text-sm leading-5">
                <b>{a.petName}</b> · {a.kind.toLowerCase()}
                <span className="block text-xs text-inkFaint">
                  {ago(a.happenedAt)} · logged by {a.loggedBy}
                </span>
              </span>
              {a.happenedAt > dotCutoff && (
                <span className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" aria-hidden />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
