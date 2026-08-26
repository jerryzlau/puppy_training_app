"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MONTH_TITLES, SKILL_BADGES, weekProgress } from "@biru/shared";
import { useCourse, useSpecies, SPECIES_COPY } from "@/lib/course";
import type { ProgressStatsDto } from "@biru/shared";
import { api } from "@/lib/api";
import { useProgress } from "@/lib/progress";
import { useSession } from "@/lib/session";
import { Stamp } from "@/components/scrapbook";

type Stats = ProgressStatsDto & { badges: string[] };

export default function School() {
  const { checkedSet, rollup } = useProgress();
  const { household } = useSession();
  const manifest = useCourse();
  const species = useSpecies();
  const copy = SPECIES_COPY[species];
  const [stats, setStats] = useState<Stats | null>(null);

  // The report card is a nice-to-have on top of the curriculum: if it fails to
  // load, the week list below still works, so this never blocks the page.
  useEffect(() => {
    let cancelled = false;
    api<Stats>("/progress/stats")
      .then((s) => !cancelled && setStats(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [checkedSet.size]);

  const petName = household?.petName ?? "your pet";
  const memberBar = (color: string) => (color === "blue" ? "bg-sky" : "bg-accent");
  const maxCount = Math.max(1, ...(stats?.perMember ?? []).map((m) => m.count));

  return (
    <main className="px-5 pt-12">
      <h1 className="font-hand text-[38px] leading-none px-1">{copy.school} 🎓</h1>
      <div className="px-1 mt-2">
        <Stamp>{manifest.weeks.length}-week {copy.curriculum}</Stamp>
      </div>

      {/* report card */}
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
        {stats && (
          <div className="flex justify-around mt-3.5 pt-3 border-t-[1.5px] border-dashed border-ruled text-sm text-center">
            <div>
              <b className="text-xl">🔥 {stats.streakDays}</b>
              <br />
              day streak
            </div>
            <div>
              <b className="text-xl">
                {stats.weeksDone}
                <span className="text-sm text-inkSoft">/{manifest.weeks.length}</span>
              </b>
              <br />
              weeks done
            </div>
            <div>
              <b className="text-xl">{rollup.checkedTasks}</b>
              <br />
              ticks total
            </div>
          </div>
        )}
      </div>

      {/* curriculum */}
      {[...new Set(manifest.weeks.map((w) => w.month))].map((month) => (
        <section key={month}>
          <h2 className="font-hand text-2xl text-wood mb-1 mt-4 px-1">
            {MONTH_TITLES[month] ?? `month ${month}`}
          </h2>
          <div className="lg:grid lg:grid-cols-2 lg:gap-x-5 lg:items-start">
          {manifest.weeks
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
          </div>
        </section>
      ))}

      {/* merit badges */}
      <h2 className="font-hand text-2xl text-wood mb-2 mt-7 px-1">merit badges</h2>
      <div className="flex gap-2.5 flex-wrap mb-6 px-1">
        {SKILL_BADGES.map((b) => {
          const earned = stats?.badges.includes(b.label) ?? false;
          return (
            <Stamp
              key={b.label}
              color={earned ? "green" : "gray"}
              className={earned ? "" : "opacity-60"}
            >
              {earned ? "✓ " : "⏳ "}
              {b.label}
            </Stamp>
          );
        })}
      </div>

      {/* teacher's pet */}
      {stats && stats.perMember.length > 0 && (
        <>
          <h2 className="font-hand text-2xl text-wood mb-2 px-1">who&apos;s teacher&apos;s pet?</h2>
          <div className="bg-white border border-[#E2D5B8] px-4 py-4 rotate-[0.3deg] shadow-sketchSoft">
            {stats.perMember.map((m) => (
              <div key={m.userId} className="flex items-center gap-2.5 text-sm mb-2.5 last:mb-0">
                <span className="w-16 truncate font-bold">{m.displayName}</span>
                <div className="flex-1 h-3 border-[1.5px] border-ink rounded-full overflow-hidden bg-paper">
                  <div
                    className={`h-full rounded-full ${memberBar(m.color)}`}
                    style={{ width: `${Math.round((m.count / maxCount) * 100)}%` }}
                  />
                </div>
                <b className="w-9 text-right">{m.count}</b>
              </div>
            ))}
            <div className="font-hand text-lg text-wood mt-2">
              ticks checked by each of you. it&apos;s not a competition. (it is.)
            </div>
          </div>
        </>
      )}

      <div className="font-hand text-lg text-inkFaint text-center mt-6">
        {petName} is {rollup.percent}% of the way through school
      </div>
      <div className="h-8" />
    </main>
  );
}
