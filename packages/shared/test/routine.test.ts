import { describe, it, expect } from "vitest";
import { minutesPastMidnight, localDay, median, formatMinutes, summarizePattern } from "../src/routine.js";

const TZ = "America/New_York";

describe("routine time helpers", () => {
  it("reads time-of-day in the household zone, not UTC", () => {
    // 2026-08-22T11:10:00Z is 7:10am in New York (EDT, UTC-4)
    expect(minutesPastMidnight("2026-08-22T11:10:00Z", TZ)).toBe(7 * 60 + 10);
  });

  it("handles local midnight as 0, not 1440", () => {
    // 04:00Z is midnight in New York during EDT
    expect(minutesPastMidnight("2026-08-22T04:00:00Z", TZ)).toBe(0);
  });

  it("assigns late-evening instants to the correct local day", () => {
    // 01:30Z on the 23rd is still 9:30pm on the 22nd in New York
    expect(localDay("2026-08-23T01:30:00Z", TZ)).toBe("2026-08-22");
  });

  it("takes the median of an even-length set", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it("formats noon and midnight without a 0 o'clock", () => {
    expect(formatMinutes(0)).toBe("12:00am");
    expect(formatMinutes(12 * 60)).toBe("12:00pm");
    expect(formatMinutes(7 * 60 + 5)).toBe("7:05am");
  });

  it("summarizes a spread of breakfasts", () => {
    const p = summarizePattern("breakfast", "breakfast", [
      "2026-08-22T11:10:00Z", // 7:10am
      "2026-08-21T10:40:00Z", // 6:40am
      "2026-08-20T11:55:00Z", // 7:55am
    ], TZ);
    expect(p.count).toBe(3);
    expect(p.medianMinutes).toBe(7 * 60 + 10);
    expect(p.earliestMinutes).toBe(6 * 60 + 40);
    expect(p.latestMinutes).toBe(7 * 60 + 55);
  });

  it("does not crash on an empty set", () => {
    const p = summarizePattern("walk", "walk", [], TZ);
    expect(p.count).toBe(0);
    expect(p.medianMinutes).toBe(0);
  });
});
