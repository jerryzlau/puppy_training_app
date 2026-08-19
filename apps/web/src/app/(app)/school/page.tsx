"use client";

import Link from "next/link";
import { COURSE_MANIFEST, MONTH_TITLES, weekProgress } from "@biru/shared";
import { useProgress } from "@/lib/progress";
import { Stamp } from "@/components/scrapbook";

export default function School() {
  const { checkedSet, rollup } = useProgress();

  return (
    <main className="px-5 pt-12">
      <h1 className="font-hand text-[38px] leading-none px-1">Puppy School 🎓</h1>
      <div className="px-1 mt-2">
        <Stamp>{COURSE_MANIFEST.weeks.length}-week biewer curriculum</Stamp>
      </div>

      <div className="bg-white border-2 border-ink rounded-lg px-4 py-3.5 shadow-sketchSoft my-5 -rotate-[0.5deg]">
        <div className="flex justify-between items-center">
          <b className="text-[15px]">report card: {rollup.percent}% ✏️</b>
          <span className="font-hand text-xl text-accent">
            {rollup.lessonsDone}/{rollup.totalLessons} lessons
          </span>
        </div>
        <div className="h-3.5 border-[1.5px] border-ink rounded-full mt-2.5 bg-paper overflow-hidden">
          <div
            className="h-full rounded-full bg-[repeating-linear-gradient(45deg,#C0533E,#C0533E_6px,#D46A55_6px,#D46A55_12px)] transition-all"
            style={{ width: `${rollup.percent}%` }}
          />
        </div>
      </div>

      {[...new Set(COURSE_MANIFEST.weeks.map((w) => w.month))].map((month) => (
        <section key={month}>
          <h2 className="font-hand text-2xl text-wood mb-1 mt-4 px-1">
            {MONTH_TITLES[month] ?? `month ${month}`}
          </h2>
          {COURSE_MANIFEST.weeks
            .filter((w) => w.month === month)
            .map((w) => {
              const wp = weekProgress(w, checkedSet);
              const isCurrent = w.week === rollup.currentWeek;
              return (
                <Link
                  key={w.week}
                  href={`/school/week-${String(w.week).padStart(2, "0")}`}
                  className={
                    isCurrent
                      ? "flex items-center gap-3 border-2 border-accent rounded-lg bg-white px-3.5 py-3 my-2 shadow-[3px_3px_0_rgba(192,83,62,.3)] rotate-[0.4deg] active:opacity-80"
                      : `flex items-center gap-3 py-3 px-1 border-b-[1.5px] border-dashed border-ruled active:opacity-70 ${wp.done ? "opacity-70" : ""}`
                  }
                >
                  {wp.done ? (
                    <Stamp>done!</Stamp>
                  ) : isCurrent ? (
                    <span className="text-2xl" aria-hidden>
                      ✏️
                    </span>
                  ) : (
                    <span className="text-xl opacity-60" aria-hidden>
                      📖
                    </span>
                  )}
                  <div className="flex-1 text-[14.5px]">
                    <b>
                      week {w.week} — {w.theme}
                    </b>
                    <div
                      className={`text-xs ${isCurrent ? "text-accent font-bold" : "text-inkSoft"}`}
                    >
                      {isCurrent
                        ? `${wp.lessonsDone} of ${wp.totalLessons} lessons · keep going →`
                        : `${wp.lessonsDone}/${wp.totalLessons} lessons`}
                    </div>
                  </div>
                </Link>
              );
            })}
        </section>
      ))}
      <div className="h-6" />
    </main>
  );
}
