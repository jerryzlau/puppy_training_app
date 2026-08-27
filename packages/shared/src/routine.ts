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

/* ── bathroom forecast ───────────────────────────────────────────────────── */

export interface RoutineForecast {
  /** predicted next event; null with fewer than 3 observations */
  nextAt: string | null;
  /** median minutes between consecutive events */
  medianIntervalMinutes: number | null;
  /** events per day over the observed window */
  avgPerDay: number;
  count: number;
}

/**
 * Forecast the next event from its history: median gap between consecutive
 * events (median shrugs off the long overnight gaps) added to the most recent
 * one. Deliberately simple and stated as an estimate, not a promise.
 */
export function forecastNext(times: (string | Date)[], windowDays = 14): RoutineForecast {
  const ms = times.map((t) => new Date(t).getTime()).sort((a, b) => a - b);
  const count = ms.length;
  const avgPerDay = count / windowDays;
  if (count < 3) return { nextAt: null, medianIntervalMinutes: null, avgPerDay, count };
  const gaps: number[] = [];
  for (let i = 1; i < ms.length; i++) gaps.push((ms[i] - ms[i - 1]) / 60_000);
  const med = median(gaps.map(Math.round));
  const nextAt = new Date(ms[ms.length - 1] + med * 60_000).toISOString();
  return { nextAt, medianIntervalMinutes: med, avgPerDay, count };
}

/** Events per local day for the last `days` days, oldest first (chart series). */
export function dailyCounts(
  times: (string | Date)[],
  days: number,
  tz: string = HOUSEHOLD_TZ,
  today: string = localDay(new Date(), tz)
): { day: string; count: number }[] {
  const byDay = new Map<string, number>();
  for (const t of times) {
    const d = localDay(t, tz);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  const out: { day: string; count: number }[] = [];
  const [y, m, d0] = today.split("-").map(Number);
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d0 - i));
    const day = dt.toISOString().slice(0, 10);
    out.push({ day, count: byDay.get(day) ?? 0 });
  }
  return out;
}
