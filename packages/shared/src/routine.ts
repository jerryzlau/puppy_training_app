import type { RoutinePatternDto } from "./types.js";

/** The household's local timezone. Routine is time-of-day sensitive, so every
 *  clock reading below is resolved in this zone rather than UTC or the device's. */
export const HOUSEHOLD_TZ = "America/New_York";

/** Minutes past local midnight for an instant, in the given zone. */
export function minutesPastMidnight(iso: string | Date, tz: string = HOUSEHOLD_TZ): number {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // Intl renders midnight as 24 in some environments.
  return (hour % 24) * 60 + minute;
}

/** The local calendar day (YYYY-MM-DD) an instant falls on. */
export function localDay(iso: string | Date, tz: string = HOUSEHOLD_TZ): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** "7:10am" from minutes past midnight. */
export function formatMinutes(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  const suffix = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm}${suffix}`;
}

/**
 * Summarize when a kind usually happens. Times are collapsed to time-of-day, so
 * a fortnight of breakfasts becomes "usually 7:10am, between 6:40 and 7:55".
 */
export function summarizePattern(
  kind: string,
  kindKey: string,
  times: (string | Date)[],
  tz: string = HOUSEHOLD_TZ
): RoutinePatternDto {
  const mins = times.map((t) => minutesPastMidnight(t, tz));
  return {
    kind,
    kindKey,
    count: mins.length,
    medianMinutes: median(mins),
    earliestMinutes: mins.length ? Math.min(...mins) : 0,
    latestMinutes: mins.length ? Math.max(...mins) : 0,
    recentMinutes: mins.slice(0, 14),
  };
}
