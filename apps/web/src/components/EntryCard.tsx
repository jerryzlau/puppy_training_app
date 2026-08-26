"use client";

import Link from "next/link";
import { useState } from "react";
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
  // Flip through the photos right on the card; the card itself stays a link.
  const [idx, setIdx] = useState(0);
  const many = entry.photos.length > 1;
  const cover = entry.photos[Math.min(idx, entry.photos.length - 1)];

  const flip = (e: React.MouseEvent, delta: number) => {
    // keep the surrounding <Link> from navigating
    e.preventDefault();
    e.stopPropagation();
    setIdx((i) => (i + delta + entry.photos.length) % entry.photos.length);
  };

  return (
    <Link href={`/diary/${entry.id}`} className="block mb-8 active:opacity-80">
      {cover ? (
        <>
          <Polaroid
            seed={entry.id}
            caption={`${entry.title ?? "a little moment"} · ${friendlyDate(entry.entryDate)}`}
          >
            <span className="relative block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover.url}
                alt={entry.title ?? "diary photo"}
                className="aspect-square w-full object-cover"
              />
              {many && (
                <>
                  <button
                    type="button"
                    onClick={(e) => flip(e, -1)}
                    aria-label="previous photo"
                    className="absolute left-0 inset-y-0 w-11 flex items-center justify-start pl-1.5 text-white text-2xl font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,.7)] active:opacity-60"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={(e) => flip(e, 1)}
                    aria-label="next photo"
                    className="absolute right-0 inset-y-0 w-11 flex items-center justify-end pr-1.5 text-white text-2xl font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,.7)] active:opacity-60"
                  >
                    ›
                  </button>
                  <span className="absolute bottom-1.5 inset-x-0 flex justify-center gap-1.5" aria-hidden>
                    {entry.photos.map((ph, i) => (
                      <span
                        key={ph.id}
                        className={`w-1.5 h-1.5 rounded-full ${
                          i === idx % entry.photos.length ? "bg-white" : "bg-white/45"
                        } shadow-[0_0_2px_rgba(0,0,0,.6)]`}
                      />
                    ))}
                  </span>
                </>
              )}
            </span>
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
