"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { lessonProgress } from "@biru/shared";
import { useCourse } from "@/lib/course";
import { useProgress } from "@/lib/progress";
import { Stamp } from "@/components/scrapbook";

export default function WeekPage() {
  const { week } = useParams<{ week: string }>();
  const { checkedSet } = useProgress();
  const weekNum = parseInt(week.replace("week-", ""), 10);
  const manifest = useCourse();
  const w = manifest.weeks.find((x) => x.week === weekNum);
  if (!w) notFound();

  const lessonsDone = w.lessons.filter((l) => lessonProgress(l, checkedSet).done).length;

  return (
    <main className="px-6 pt-12">
      <div className="flex items-center justify-between mb-2">
        <Link href="/school" className="font-bold text-accent text-[15px]">
          ‹ school
        </Link>
        <Stamp>
          week {w.week} · {lessonsDone}/{w.lessons.length}
        </Stamp>
      </div>
      <h1 className="font-hand text-4xl leading-tight capitalize">{w.theme}</h1>

      <div className="mt-4">
        {w.lessons.map((l) => {
          const lp = lessonProgress(l, checkedSet);
          return (
            <Link
              key={l.slug}
              href={`/school/${week}/${l.slug.split("/")[1]}`}
              className="flex items-center gap-3 py-3.5 px-1 border-b-[1.5px] border-dashed border-ruled active:opacity-70"
            >
              <span className="text-xl" aria-hidden>
                {lp.done ? "⭐" : "📖"}
              </span>
              <div className="flex-1">
                <b className={`text-[15px] ${lp.done ? "line-through decoration-accent decoration-2 text-inkFaint" : ""}`}>
                  lesson {l.order} · {l.title}
                </b>
                <div className="text-xs text-inkSoft">
                  {lp.checked}/{lp.total} ticked · ~{l.minutesPerDay} min/day
                </div>
              </div>
              <span className="text-inkFaint">›</span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
