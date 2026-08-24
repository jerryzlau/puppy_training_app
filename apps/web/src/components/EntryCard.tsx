"use client";

import Link from "next/link";
import type { EntryDto } from "@biru/shared";
import { Polaroid, NoteCard, Stamp } from "@/components/scrapbook";

export const MOOD_LABEL: Record<string, string> = {
  happy: "😊 happy",
  sleepy: "😴 sleepy",
  silly: "😆 silly",
  dramatic: "😤 dramatic",
  milestone: "⭐ milestone",
};

export function friendlyDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const today = new Date();
  const yest = new Date(today.getTime() - 86_400_000);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  if (iso === fmt(today)) return "today";
  if (iso === fmt(yest)) return "yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function EntryCard({ entry }: { entry: EntryDto }) {
  const authorColor = entry.authorColor === "blue" ? "text-sky" : "text-wood";
  const cover = entry.photos[0];

  return (
    <Link href={`/diary/${entry.id}`} className="block mb-8 active:opacity-80">
      {cover ? (
        <>
          <Polaroid
            seed={entry.id}
            caption={`${entry.title ?? "a little moment"} · ${friendlyDate(entry.entryDate)}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover.url}
              alt={entry.title ?? "diary photo"}
              className="h-[200px] w-full object-cover"
            />
          </Polaroid>
          {entry.note && (
            <p className="text-sm leading-6 mt-2.5 px-1.5 line-clamp-2">{entry.note}</p>
          )}
        </>
      ) : (
        <NoteCard seed={entry.id}>
          <div className="font-hand text-2xl">{entry.title ?? "a little note"}</div>
          {entry.note && <p className="text-sm leading-6 mt-1 line-clamp-3">{entry.note}</p>}
        </NoteCard>
      )}
      <div className="px-1.5 mt-1.5 flex items-center gap-2 flex-wrap">
        {entry.household && (
          <Stamp color="gray">
            {entry.household.species === "cat" ? "🐱" : "🐶"} {entry.household.petName}&apos;s book
          </Stamp>
        )}
        <span className={`font-hand text-lg ${authorColor}`}>
          — {entry.authorName}
          {!cover ? ` · ${friendlyDate(entry.entryDate)}` : ""}
        </span>
        {entry.mood && (
          <Stamp color={entry.mood === "milestone" ? "green" : "red"}>
            {MOOD_LABEL[entry.mood]}
          </Stamp>
        )}
        {entry.linkedLessonSlug && <Stamp color="blue">🎓 school</Stamp>}
      </div>
    </Link>
  );
}
