"use client";

import { useMemo } from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import { notFound, useParams } from "next/navigation";
import { COURSE_MANIFEST, lessonProgress } from "@biru/shared";
import { useProgress } from "@/lib/progress";
import { useSession } from "@/lib/session";
import { Stamp, SketchButton, WashiTape } from "@/components/scrapbook";

export default function LessonPage() {
  const { week, lesson } = useParams<{ week: string; lesson: string }>();
  const { checkedSet, checks, toggle } = useProgress();
  const { session } = useSession();

  const weekNum = parseInt(week.replace("week-", ""), 10);
  const w = COURSE_MANIFEST.weeks.find((x) => x.week === weekNum);
  const l = w?.lessons.find((x) => x.slug === `${week}/${lesson}`);
  if (!w || !l) notFound();

  const lp = lessonProgress(l, checkedSet);
  const next = useMemo(() => {
    const all = COURSE_MANIFEST.weeks.flatMap((x) => x.lessons);
    const idx = all.findIndex((x) => x.slug === l.slug);
    return idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
  }, [l.slug]);

  function fmtWhen(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
  }

  return (
    <main className="px-6 pt-12 pb-10">
      <div className="flex items-center justify-between mb-2">
        <Link href={`/school/${week}`} className="font-bold text-accent text-[15px]">
          ‹ week {w.week}
        </Link>
        <Stamp>
          {lp.checked}/{lp.total} ticked
        </Stamp>
      </div>
      <h1 className="font-hand text-4xl leading-tight">{l.title}</h1>
      <div className="text-xs text-inkSoft mt-1 mb-4 capitalize">
        week {w.week} · {w.theme} · ~{l.minutesPerDay} min/day
      </div>

      <div className="relative bg-white border border-[#E2D5B8] px-4 py-4 shadow-sketchSoft -rotate-[0.3deg] mb-6">
        <WashiTape className="w-16" />
        <div className="lesson-body">
          <Markdown>{l.body}</Markdown>
        </div>
      </div>

      <h2 className="font-hand text-2xl text-wood mb-1">tick them off ✏️</h2>
      {l.tasks.map((t) => {
        const on = checkedSet.has(t.id);
        const check = checks.get(t.id);
        const mine = check?.checkedBy === session?.user.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => void toggle(t.id, !on)}
            className="w-full text-left flex gap-3 items-start py-3 px-1.5 border-b-[1.5px] border-dashed border-ruled active:opacity-70"
          >
            <span
              className={`w-[26px] h-[26px] border-[2.5px] border-ink rounded bg-white flex items-center justify-center text-[20px] text-accent -rotate-1 shrink-0 font-bold`}
              aria-hidden
            >
              {on ? "✗" : ""}
            </span>
            <span className="flex-1">
              <span
                className={`text-[15px] leading-6 block ${on ? "line-through decoration-accent decoration-2 text-inkFaint" : ""}`}
              >
                {t.text}
              </span>
              {check && (
                <span className="font-hand text-base text-inkFaint">
                  — {mine ? "you" : check.checkedByName}, {fmtWhen(check.checkedAt)}
                </span>
              )}
            </span>
          </button>
        );
      })}

      {lp.done && (
        <div className="border-[2.5px] border-leaf bg-[#F2F6EF] px-4 py-4 text-center mt-5 -rotate-[0.5deg]">
          <div className="font-hand text-3xl text-leaf">gold star! lesson complete ⭐</div>
          <p className="text-sm mt-1 mb-3">scrapbook this win before you forget it!</p>
          <SketchButton
            variant="green"
            href={`/diary/new?title=${encodeURIComponent(`${l.title} — done!`)}&mood=milestone&lesson=${encodeURIComponent(l.slug)}`}
          >
            add a page to the diary 📔
          </SketchButton>
        </div>
      )}

      <div className="h-4" />
      {next && (
        <SketchButton
          variant="ghost"
          href={`/school/week-${String(next.week).padStart(2, "0")}/${next.slug.split("/")[1]}`}
        >
          next: {next.title} →
        </SketchButton>
      )}
    </main>
  );
}
