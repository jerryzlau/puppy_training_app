// Course manifest types + progress rollup / streak logic.
// The manifest itself is generated from content/course/**.mdx by scripts/build-manifest.mjs
// into src/course-manifest.ts — slugs are permanent identifiers referenced by course_progress rows.

export interface CourseTask {
  /** Full id: "week-07/leave-it-2/task-1" */
  id: string;
  text: string;
}

export interface CourseLesson {
  /** "week-07/leave-it-2" */
  slug: string;
  week: number;
  order: number;
  title: string;
  minutesPerDay: number;
  /** markdown body */
  body: string;
  tasks: CourseTask[];
}

export interface CourseWeek {
  week: number;
  /** e.g. "impulse control" */
  theme: string;
  month: number;
  lessons: CourseLesson[];
}

export interface CourseManifest {
  weeks: CourseWeek[];
  totalLessons: number;
  totalTasks: number;
}

export const MONTH_TITLES: Record<number, string> = {
  1: "month one · foundations",
  2: "month two · core obedience",
  3: "month three · the real world",
  4: "month four · surviving the teenager",
  5: "month five · polish & performance",
  6: "month six · the adventure dog",
};

// ---------- rollups ----------

export interface LessonProgress {
  slug: string;
  checked: number;
  total: number;
  done: boolean;
}

export interface WeekProgress {
  week: number;
  lessonsDone: number;
  totalLessons: number;
  done: boolean;
}

export function taskIdsForLesson(lesson: CourseLesson): string[] {
  return lesson.tasks.map((t) => t.id);
}

export function allTaskIds(manifest: CourseManifest): Set<string> {
  const ids = new Set<string>();
  for (const w of manifest.weeks) for (const l of w.lessons) for (const t of l.tasks) ids.add(t.id);
  return ids;
}

export function lessonProgress(lesson: CourseLesson, checked: Set<string>): LessonProgress {
  const total = lesson.tasks.length;
  const done = lesson.tasks.filter((t) => checked.has(t.id)).length;
  return { slug: lesson.slug, checked: done, total, done: total > 0 && done === total };
}

export function weekProgress(week: CourseWeek, checked: Set<string>): WeekProgress {
  const lessons = week.lessons.map((l) => lessonProgress(l, checked));
  const lessonsDone = lessons.filter((l) => l.done).length;
  return {
    week: week.week,
    lessonsDone,
    totalLessons: week.lessons.length,
    done: week.lessons.length > 0 && lessonsDone === week.lessons.length,
  };
}

export function courseRollup(manifest: CourseManifest, checked: Set<string>) {
  const weeks = manifest.weeks.map((w) => weekProgress(w, checked));
  const lessonsDone = manifest.weeks
    .flatMap((w) => w.lessons)
    .filter((l) => lessonProgress(l, checked).done).length;
  const checkedTasks = [...checked].length;
  const percent =
    manifest.totalTasks === 0 ? 0 : Math.round((checkedTasks / manifest.totalTasks) * 100);
  // current week = first week not fully done (or 12 if all done)
  const firstOpen = weeks.find((w) => !w.done);
  const currentWeek = firstOpen ? firstOpen.week : manifest.weeks.length;
  return {
    weeks,
    lessonsDone,
    totalLessons: manifest.totalLessons,
    checkedTasks,
    totalTasks: manifest.totalTasks,
    percent,
    weeksDone: weeks.filter((w) => w.done).length,
    currentWeek,
  };
}

// ---------- streak ----------

/** Format an instant as YYYY-MM-DD in a given IANA timezone. */
export function dayInTz(date: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date); // en-CA gives YYYY-MM-DD
}

/**
 * Streak = consecutive days (in `timeZone`, ending today or yesterday) with >= 1 activity.
 * `activityInstants` are timestamps of checks and diary entries.
 */
export function streakDays(
  activityInstants: Date[],
  timeZone = "America/New_York",
  now: Date = new Date()
): number {
  const days = new Set(activityInstants.map((d) => dayInTz(d, timeZone)));
  const today = dayInTz(now, timeZone);
  const msDay = 86_400_000;
  // Walk backwards from today; a streak may also end yesterday (today not yet logged).
  let cursor = new Date(now);
  if (!days.has(today)) cursor = new Date(now.getTime() - msDay);
  let streak = 0;
  while (days.has(dayInTz(cursor, timeZone))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - msDay);
  }
  return streak;
}

// ---------- skills / badges ----------

export interface SkillBadge {
  label: string;
  /** lesson slugs that must all be done */
  lessons: string[];
}

export const SKILL_BADGES: SkillBadge[] = [
  { label: "crate champ", lessons: ["week-01/crate-introduction", "week-08/crate-happy-place"] },
  { label: "potty (mostly)", lessons: ["week-01/potty-routine-v1", "week-03/potty-routine-v2"] },
  { label: "knows his name", lessons: ["week-02/name-recognition"] },
  { label: "sits pretty", lessons: ["week-04/sit"] },
  { label: "leash walker", lessons: ["week-05/loose-leash-foundations"] },
  { label: "leave it", lessons: ["week-07/leave-it-1", "week-07/leave-it-2"] },
  { label: "home alone hero", lessons: ["week-08/alone-15-30"] },
  { label: "recall rockstar", lessons: ["week-09/recall-with-distractions"] },
  { label: "city dog", lessons: ["week-10/cafe-settle"] },
  { label: "spa day pro", lessons: ["week-11/groomer-prep"] },
  { label: "graduate 🎓", lessons: ["week-12/graduation-day"] },
  { label: "teen survivor", lessons: ["week-13/regression-is-normal", "week-14/recall-rebuild"] },
  { label: "heel artist", lessons: ["week-17/heel-foundations", "week-17/heel-on-the-street"] },
  { label: "trick star ✨", lessons: ["week-19/trick-weave", "week-19/trick-play-dead"] },
  { label: "trail hound", lessons: ["week-21/first-real-hike"] },
  { label: "canine good citizen", lessons: ["week-23/cgc-test-run"] },
  { label: "graduate, with honors 🎓🎓", lessons: ["week-24/graduation-with-honors"] },
];

export function earnedBadges(manifest: CourseManifest, checked: Set<string>): SkillBadge[] {
  const bySlug = new Map<string, CourseLesson>();
  for (const w of manifest.weeks) for (const l of w.lessons) bySlug.set(l.slug, l);
  return SKILL_BADGES.filter((b) =>
    b.lessons.every((slug) => {
      const lesson = bySlug.get(slug);
      return lesson ? lessonProgress(lesson, checked).done : false;
    })
  );
}
