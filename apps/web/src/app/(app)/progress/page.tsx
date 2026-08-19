"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { ProgressStatsDto } from "@biru/shared";
import { COURSE_MANIFEST, SKILL_BADGES } from "@biru/shared";
import { Stamp, Loading, ErrorNote } from "@/components/scrapbook";

type Stats = ProgressStatsDto & { badges: string[] };

export default function ProgressPage() {
  const { household } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("/progress/stats")
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : "couldn't load"));
  }, []);

  if (error) return <main className="px-6 pt-16"><ErrorNote message={error} /></main>;
  if (!stats) return <Loading label="grading homework…" />;

  const dogName = household?.dogName ?? "Biru";
  const memberBar = (color: string) => (color === "blue" ? "bg-sky" : "bg-accent");
  const maxCount = Math.max(1, ...stats.perMember.map((m) => m.count));

  return (
    <main className="px-6 pt-12">
      <h1 className="font-hand text-[38px] leading-none">Report Card 🏅</h1>

      <div className="bg-white border-2 border-ink rounded-lg p-4 shadow-sketchSoft text-center my-5 -rotate-[0.4deg]">
        <div className="font-hand text-2xl text-wood">{dogName}&apos;s semester so far</div>
        <div className="font-hand text-6xl text-accent leading-tight">{stats.percent}%</div>
        <div className="flex justify-around mt-2 text-sm">
          <div>
            <b className="text-xl">{stats.lessonsDone}</b>
            <br />
            lessons
          </div>
          <div>
            <b className="text-xl">🔥 {stats.streakDays}</b>
            <br />
            day streak
          </div>
          <div>
            <b className="text-xl">
              {stats.weeksDone}
              <span className="text-sm text-inkSoft">/{COURSE_MANIFEST.weeks.length}</span>
            </b>
            <br />
            weeks done
          </div>
        </div>
      </div>

      <h2 className="font-hand text-2xl text-wood mb-2">merit badges</h2>
      <div className="flex gap-2.5 flex-wrap mb-6">
        {SKILL_BADGES.map((b) => {
          const earned = stats.badges.includes(b.label);
          return (
            <Stamp key={b.label} color={earned ? "green" : "gray"} className={earned ? "" : "opacity-60"}>
              {earned ? "✓ " : "⏳ "}
              {b.label}
            </Stamp>
          );
        })}
      </div>

      <h2 className="font-hand text-2xl text-wood mb-2">who&apos;s teacher&apos;s pet?</h2>
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
      <div className="h-8" />
    </main>
  );
}
