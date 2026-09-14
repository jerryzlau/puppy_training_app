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
  /**
   * How nextAt was made. "first": the next event is the first of a day (the
   * puppy is asleep or hasn't gone yet), so it's the typical first-of-day time.
   * "daytime": there's already been one today, so it's the last event plus the
   * typical gap between same-day events. null when there's no prediction.
   */
  mode: "first" | "daytime" | null;
  /** median minutes between consecutive events on the same local day */
  medianIntervalMinutes: number | null;
  /** median time-of-day (minutes past local midnight) of each day's first event */
  medianFirstMinutes: number | null;
  /** median time-of-day of each day's last event — the "bedtime" cutoff */
  medianLastMinutes: number | null;
  /** events per day over the observed window */
  avgPerDay: number;
  count: number;
}

/** Gap between a "last" time-of-day and a prediction after which we assume the
 *  puppy is down for the night and the next one is tomorrow's first. */
const BEDTIME_SLACK_MIN = 90;

function atLocalMinutes(day: string, minutes: number, tz: string): Date {
  // Find the instant that is `minutes` past midnight on `day` in `tz`.
  // Start from noon UTC on that date and correct by the observed local offset.
  const [y, m, d] = day.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const localNoon = minutesPastMidnight(guess, tz);
  const shiftedDay = localDay(guess, tz) === day ? 0 : localDay(guess, tz) < day ? 1 : -1;
  return new Date(guess.getTime() + (minutes - localNoon + shiftedDay * 1440) * 60_000);
}

function nextLocalDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Forecast the next event from its history, in two regimes:
 *
 * - Nothing logged yet today → the next one is the first of the day. Puppies
 *   sleep through the night, so that gap has nothing to do with daytime
 *   frequency: predict the typical (median) time-of-day of each day's first
 *   event instead.
 * - Something logged today → last event + the typical gap between same-day
 *   events (overnight gaps are excluded from that median). If that lands past
 *   the typical last-of-day time, assume bedtime and predict tomorrow's first.
 *
 * Deliberately simple and stated as an estimate, not a promise.
 */
export function forecastNext(
  times: (string | Date)[],
  windowDays = 14,
  now: Date = new Date(),
  tz: string = HOUSEHOLD_TZ
): RoutineForecast {
  const ms = times.map((t) => new Date(t).getTime()).sort((a, b) => a - b);
  const count = ms.length;
  const avgPerDay = count / windowDays;
  const none: RoutineForecast = {
    nextAt: null,
    mode: null,
    medianIntervalMinutes: null,
    medianFirstMinutes: null,
    medianLastMinutes: null,
    avgPerDay,
    count,
  };
  if (count < 3) return none;

  // group by local day, in order
  const byDay = new Map<string, number[]>();
  for (const t of ms) {
    const d = localDay(new Date(t), tz);
    const arr = byDay.get(d);
    if (arr) arr.push(t);
    else byDay.set(d, [t]);
  }
  const firsts: number[] = [];
  const lasts: number[] = [];
  const dayGaps: number[] = [];
  for (const arr of byDay.values()) {
    firsts.push(minutesPastMidnight(new Date(arr[0]), tz));
    lasts.push(minutesPastMidnight(new Date(arr[arr.length - 1]), tz));
    for (let i = 1; i < arr.length; i++) dayGaps.push(Math.round((arr[i] - arr[i - 1]) / 60_000));
  }
  const medianFirstMinutes = median(firsts);
  const medianLastMinutes = median(lasts);
  // fall back to all gaps when no day has two events yet
  const allGaps: number[] = [];
  for (let i = 1; i < ms.length; i++) allGaps.push(Math.round((ms[i] - ms[i - 1]) / 60_000));
  const medianIntervalMinutes = median(dayGaps.length ? dayGaps : allGaps);

  const today = localDay(now, tz);
  const last = ms[ms.length - 1];
  const lastDay = localDay(new Date(last), tz);
  const base = { medianIntervalMinutes, medianFirstMinutes, medianLastMinutes, avgPerDay, count };

  if (lastDay !== today) {
    // asleep / not yet up: today's first, at the usual first-of-day time
    return { ...base, mode: "first", nextAt: atLocalMinutes(today, medianFirstMinutes, tz).toISOString() };
  }
  const next = last + medianIntervalMinutes * 60_000;
  const nextDay = localDay(new Date(next), tz);
  const pastBedtime = nextDay !== today || minutesPastMidnight(new Date(next), tz) > medianLastMinutes + BEDTIME_SLACK_MIN;
  if (pastBedtime) {
    return {
      ...base,
      mode: "first",
      nextAt: atLocalMinutes(nextLocalDay(today), medianFirstMinutes, tz).toISOString(),
    };
  }
  return { ...base, mode: "daytime", nextAt: new Date(next).toISOString() };
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
    const d = localDay(new Date(t), tz);
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
