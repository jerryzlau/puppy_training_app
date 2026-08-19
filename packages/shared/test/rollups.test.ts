import { describe, it, expect } from "vitest";
import {
  courseRollup,
  lessonProgress,
  weekProgress,
  streakDays,
  earnedBadges,
  allTaskIds,
  type CourseManifest,
  type CourseWeek,
} from "../src/course.js";

function fixtureManifest(): CourseManifest {
  const mkLesson = (week: number, name: string, order: number, taskCount: number) => ({
    slug: `week-${String(week).padStart(2, "0")}/${name}`,
    week,
    order,
    title: name,
    minutesPerDay: 10,
    body: "body",
    tasks: Array.from({ length: taskCount }, (_, i) => ({
      id: `week-${String(week).padStart(2, "0")}/${name}/task-${i + 1}`,
      text: `task ${i + 1}`,
    })),
  });
  const weeks: CourseWeek[] = [
    { week: 1, theme: "a", month: 1, lessons: [mkLesson(1, "l1", 1, 3), mkLesson(1, "l2", 2, 4)] },
    { week: 2, theme: "b", month: 1, lessons: [mkLesson(2, "l1", 1, 3)] },
  ];
  return { weeks, totalLessons: 3, totalTasks: 10 };
}

describe("lesson/week/course rollups", () => {
  it("computes lesson done only when every task checked", () => {
    const m = fixtureManifest();
    const lesson = m.weeks[0].lessons[0];
    expect(lessonProgress(lesson, new Set()).done).toBe(false);
    expect(
      lessonProgress(lesson, new Set(["week-01/l1/task-1", "week-01/l1/task-2"])).done
    ).toBe(false);
    expect(
      lessonProgress(
        lesson,
        new Set(["week-01/l1/task-1", "week-01/l1/task-2", "week-01/l1/task-3"])
      ).done
    ).toBe(true);
  });

  it("week done requires all lessons done", () => {
    const m = fixtureManifest();
    const checked = new Set([
      "week-01/l1/task-1",
      "week-01/l1/task-2",
      "week-01/l1/task-3",
    ]);
    expect(weekProgress(m.weeks[0], checked).done).toBe(false);
    ["task-1", "task-2", "task-3", "task-4"].forEach((t) => checked.add(`week-01/l2/${t}`));
    expect(weekProgress(m.weeks[0], checked).done).toBe(true);
  });

  it("hand-computed course percent and current week", () => {
    const m = fixtureManifest();
    const checked = new Set([
      "week-01/l1/task-1",
      "week-01/l1/task-2",
      "week-01/l1/task-3",
      "week-01/l2/task-1",
      "week-01/l2/task-2",
    ]);
    const r = courseRollup(m, checked);
    expect(r.checkedTasks).toBe(5);
    expect(r.totalTasks).toBe(10);
    expect(r.percent).toBe(50);
    expect(r.lessonsDone).toBe(1);
    expect(r.currentWeek).toBe(1);
    expect(r.weeksDone).toBe(0);
  });

  it("all done → currentWeek = last week", () => {
    const m = fixtureManifest();
    const r = courseRollup(m, allTaskIds(m));
    expect(r.percent).toBe(100);
    expect(r.weeksDone).toBe(2);
    expect(r.currentWeek).toBe(2);
  });
});

describe("streak", () => {
  const tz = "America/New_York";
  const day = (s: string) => new Date(s);

  it("counts consecutive days ending today", () => {
    const now = day("2026-08-18T20:00:00-04:00");
    const acts = [
      day("2026-08-18T08:00:00-04:00"),
      day("2026-08-17T21:00:00-04:00"),
      day("2026-08-16T10:00:00-04:00"),
      day("2026-08-13T10:00:00-04:00"), // gap on 14th/15th
    ];
    expect(streakDays(acts, tz, now)).toBe(3);
  });

  it("streak survives if today has no activity yet (ends yesterday)", () => {
    const now = day("2026-08-18T09:00:00-04:00");
    const acts = [day("2026-08-17T21:00:00-04:00"), day("2026-08-16T10:00:00-04:00")];
    expect(streakDays(acts, tz, now)).toBe(2);
  });

  it("timezone boundary: 11pm ET vs UTC next day are the same ET day", () => {
    const now = day("2026-08-18T12:00:00-04:00");
    // 2026-08-18T03:00:00Z is Aug 17 at 11pm ET
    const acts = [day("2026-08-18T03:00:00Z"), day("2026-08-18T10:00:00-04:00")];
    expect(streakDays(acts, tz, now)).toBe(2);
  });

  it("no activity → 0", () => {
    expect(streakDays([], tz, day("2026-08-18T12:00:00-04:00"))).toBe(0);
  });
});

describe("badges", () => {
  it("earns nothing on empty progress", () => {
    const m = fixtureManifest();
    expect(earnedBadges(m, new Set())).toEqual([]);
  });
});
