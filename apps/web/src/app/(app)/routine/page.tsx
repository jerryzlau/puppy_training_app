"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  formatMinutes,
  localDay,
  minutesPastMidnight,
  type RoutineItemDto,
  type RoutineKindDto,
  type RoutinePatternDto,
} from "@biru/shared";
import { HandLabel, SketchButton, ErrorNote, Loading, Stamp } from "@/components/scrapbook";

/** "14:05" for a datetime-local input, in the browser's own zone. */
function clockValue(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Combine a YYYY-MM-DD day and a HH:MM clock into an absolute instant. */
function instantFrom(day: string, clock: string): string {
  const [h, m] = clock.split(":").map(Number);
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(y, mo - 1, d, h || 0, m || 0, 0, 0).toISOString();
}

function shiftDay(day: string, delta: number): string {
  const [y, mo, d] = day.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate()
  ).padStart(2, "0")}`;
}

export default function RoutinePage() {
  const { household } = useSession();
  const today = useMemo(() => localDay(new Date()), []);
  const [day, setDay] = useState(today);
  const [items, setItems] = useState<RoutineItemDto[]>([]);
  const [kinds, setKinds] = useState<RoutineKindDto[]>([]);
  const [patterns, setPatterns] = useState<RoutinePatternDto[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // full-form state
  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState("");
  const [note, setNote] = useState("");
  const [clock, setClock] = useState(clockValue(new Date()));

  const loadDay = useCallback(async (d: string) => {
    const feed = await api<{ items: RoutineItemDto[] }>(`/routine?day=${d}`);
    setItems(feed.items);
  }, []);

  const loadSide = useCallback(async () => {
    const [k, p] = await Promise.all([
      api<{ kinds: RoutineKindDto[] }>("/routine/kinds").catch(() => ({ kinds: [] })),
      api<{ patterns: RoutinePatternDto[] }>("/routine/patterns").catch(() => ({ patterns: [] })),
    ]);
    setKinds(k.kinds);
    setPatterns(p.patterns);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    loadDay(day)
      .then(() => !cancelled && setState("ready"))
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "couldn't load");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [day, loadDay]);

  useEffect(() => {
    void loadSide();
  }, [loadSide]);

  /** One tap: log this title at the current time. */
  async function quickAdd(title: string) {
    setBusy(true);
    setError("");
    try {
      const now = new Date();
      await api<RoutineItemDto>("/routine", {
        method: "POST",
        body: { day, kind: title, note: null, happenedAt: instantFrom(day, clockValue(now)) },
      });
      await Promise.all([loadDay(day), loadSide()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't add that");
    } finally {
      setBusy(false);
    }
  }

  async function addDetailed() {
    if (!kind.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api<RoutineItemDto>("/routine", {
        method: "POST",
        body: {
          day,
          kind: kind.trim(),
          note: note.trim() || null,
          happenedAt: instantFrom(day, clock),
        },
      });
      setKind("");
      setNote("");
      setFormOpen(false);
      await Promise.all([loadDay(day), loadSide()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't add that");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id)); // optimistic
    try {
      await api(`/routine/${id}`, { method: "DELETE" });
      await loadSide();
    } catch {
      await loadDay(day); // put it back
    }
  }

  const dogName = household?.dogName ?? "Biru";
  const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <main className="px-5 pt-12">
      <h1 className="font-hand text-[38px] leading-none px-1">{dogName}&apos;s Routine ⏰</h1>

      {/* day picker */}
      <div className="flex items-center justify-between mt-3 mb-1 px-1 md:max-w-[440px]">
        <button
          type="button"
          onClick={() => setDay(shiftDay(day, -1))}
          className="font-bold text-accent text-[15px] px-2 py-1"
          aria-label="previous day"
        >
          ‹
        </button>
        <div className="text-center">
          <div className="font-hand text-2xl leading-none">{dayLabel}</div>
          {day !== today && (
            <button
              type="button"
              onClick={() => setDay(today)}
              className="text-xs text-accent font-bold mt-0.5"
            >
              jump to today
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDay(shiftDay(day, 1))}
          disabled={day >= today}
          className="font-bold text-accent text-[15px] px-2 py-1 disabled:opacity-30"
          aria-label="next day"
        >
          ›
        </button>
      </div>

      {/* quick add */}
      {kinds.length > 0 && (
        <>
          <HandLabel>tap to log it right now</HandLabel>
          <div className="flex gap-2 flex-wrap mb-3">
            {kinds.slice(0, 10).map((k) => (
              <button
                key={k.kindKey}
                type="button"
                disabled={busy}
                onClick={() => void quickAdd(k.kind)}
                className="px-3 py-1.5 rounded-full border-2 border-ink bg-white text-sm font-bold active:opacity-70 disabled:opacity-40"
              >
                {k.kind}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="md:max-w-[440px]">
        <SketchButton variant="ghost" onClick={() => setFormOpen(!formOpen)} className="mb-3">
        {formOpen ? "never mind" : "+ log something else"}
        </SketchButton>
      </div>

      {formOpen && (
        <div className="bg-white border border-[#E2D5B8] px-4 py-3 shadow-sketchSoft mb-4 md:max-w-[520px]">
          <HandLabel>what happened?</HandLabel>
          <input
            className="input-line"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            placeholder="breakfast"
            maxLength={60}
            list="routine-kinds"
          />
          <datalist id="routine-kinds">
            {kinds.map((k) => (
              <option key={k.kindKey} value={k.kind} />
            ))}
          </datalist>
          <HandLabel>what time?</HandLabel>
          <input
            className="input-line"
            type="time"
            value={clock}
            onChange={(e) => setClock(e.target.value)}
          />
          <HandLabel>anything to note? (optional)</HandLabel>
          <input
            className="input-line"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ate everything, no fuss"
            maxLength={500}
          />
          <div className="h-4" />
          <SketchButton onClick={addDetailed} disabled={busy || !kind.trim()}>
            {busy ? "writing it down…" : "add to the routine"}
          </SketchButton>
        </div>
      )}

      {error && <ErrorNote message={error} />}

      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 lg:items-start">
        <div>
      {/* the day's timeline */}
      {state === "loading" && <Loading label="reading the day…" />}
      {state === "ready" && items.length === 0 && (
        <div className="font-hand text-xl text-inkFaint text-center py-8">
          nothing logged for this day yet
        </div>
      )}
      {state === "ready" &&
        items.map((it) => (
          <div
            key={it.id}
            className="flex gap-3 items-start py-3 px-1 border-b-[1.5px] border-dashed border-ruled"
          >
            <span className="font-hand text-xl text-accent w-[72px] shrink-0 tabular-nums">
              {formatMinutes(minutesPastMidnight(it.happenedAt))}
            </span>
            <span className="flex-1">
              <b className="text-[15px]">{it.kind}</b>
              {it.note && <span className="block text-sm text-inkSoft">{it.note}</span>}
              <span className="font-hand text-base text-inkFaint">— {it.createdByName}</span>
            </span>
            <button
              type="button"
              onClick={() => void remove(it.id)}
              className="text-inkFaint text-base shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2 active:opacity-60"
              aria-label={`remove ${it.kind}`}
            >
              ✕
            </button>
          </div>
        ))}

        </div>

      {/* patterns */}
      <div className="lg:sticky lg:top-8">
      {patterns.length > 0 && (
        <>
          <h2 className="font-hand text-2xl text-wood mt-7 mb-1 px-1">when things usually happen</h2>
          <p className="text-xs text-inkSoft mb-2 px-1">from the last 3 weeks</p>
          <div className="bg-white border border-[#E2D5B8] px-4 py-3 shadow-sketchSoft rotate-[0.3deg]">
            {patterns.map((p) => (
              <div key={p.kindKey} className="mb-3 last:mb-0">
                <div className="flex justify-between items-baseline">
                  <b className="text-[15px]">{p.kind}</b>
                  <span className="font-hand text-xl text-accent">
                    {formatMinutes(p.medianMinutes)}
                  </span>
                </div>
                {/* a 24h strip with each occurrence marked */}
                <div className="relative h-3 border-[1.5px] border-ink rounded-full bg-paper overflow-hidden mt-1">
                  <div
                    className="absolute inset-y-0 bg-[#EADFC6]"
                    style={{
                      left: `${(p.earliestMinutes / 1440) * 100}%`,
                      width: `${Math.max(1, ((p.latestMinutes - p.earliestMinutes) / 1440) * 100)}%`,
                    }}
                  />
                  {p.recentMinutes.map((m, i) => (
                    <div
                      key={i}
                      className="absolute inset-y-0 w-[2px] bg-accent opacity-70"
                      style={{ left: `${(m / 1440) * 100}%` }}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-inkFaint mt-0.5">
                  <span>{formatMinutes(p.earliestMinutes)}</span>
                  <Stamp color="gray">{p.count}×</Stamp>
                  <span>{formatMinutes(p.latestMinutes)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      </div>
      </div>

      <div className="h-8" />
    </main>
  );
}
