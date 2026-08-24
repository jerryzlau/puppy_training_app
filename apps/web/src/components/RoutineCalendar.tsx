"use client";

// Month calendar of routine history: a dot-marked grid showing which days have
// entries. Tapping a marked day hands the date back so the page can jump to
// its timeline.

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface DaySummary {
  day: string;
  count: number;
  kinds: string[];
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function RoutineCalendar({
  today,
  onPickDay,
}: {
  today: string;
  onPickDay: (day: string) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [days, setDays] = useState<Map<string, DaySummary>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<{ days: DaySummary[] }>(`/routine/calendar?month=${month}`)
      .then((r) => {
        if (cancelled) return;
        setDays(new Map(r.days.map((d) => [d.day, d])));
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [month]);

  const [y, m] = month.split("-").map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];

  return (
    <div className="md:max-w-[440px]">
      {/* month nav */}
      <div className="flex items-center justify-between mb-2 px-1">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          className="font-bold text-accent text-[15px] px-2 py-1"
          aria-label="previous month"
        >
          ‹
        </button>
        <span className="font-hand text-2xl">{monthLabel(month)}</span>
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= today.slice(0, 7)}
          className="font-bold text-accent text-[15px] px-2 py-1 disabled:opacity-30"
          aria-label="next month"
        >
          ›
        </button>
      </div>

      <div className={`bg-white border border-[#E2D5B8] p-3 shadow-sketchSoft ${loading ? "opacity-60" : ""}`}>
        <div className="grid grid-cols-7 text-center text-xs font-bold text-inkFaint mb-1">
          {WEEKDAYS.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((day, i) => {
            if (!day) return <span key={`pad-${i}`} />;
            const info = days.get(day);
            const isToday = day === today;
            const future = day > today;
            return (
              <button
                key={day}
                type="button"
                disabled={future}
                onClick={() => onPickDay(day)}
                aria-label={`${day}${info ? `, ${info.count} entries` : ""}`}
                className={`flex flex-col items-center justify-start h-12 rounded text-[13px]
                  ${future ? "text-inkFaint/40" : "active:bg-paper"}
                  ${isToday ? "border-2 border-accent font-bold" : ""}`}
              >
                <span className={info ? "font-bold" : ""}>{Number(day.slice(8))}</span>
                {info && (
                  <span className="flex gap-0.5 mt-0.5" aria-hidden>
                    {Array.from({ length: Math.min(info.count, 4) }).map((_, j) => (
                      <span key={j} className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
                    ))}
                    {info.count > 4 && <span className="text-[9px] text-accent leading-none">+</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-inkSoft text-center mt-2">tap a day to open its page</p>
      </div>
    </div>
  );
}
