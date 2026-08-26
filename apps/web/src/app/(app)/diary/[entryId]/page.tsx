"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { type EntryDto } from "@biru/shared";
import { useCourse } from "@/lib/course";
import { MOOD_LABEL, friendlyDate } from "@/components/EntryCard";
import {
  Polaroid,
  NoteCard,
  Stamp,
  SketchButton,
  Loading,
  ErrorNote,
} from "@/components/scrapbook";

export default function EntryDetail() {
  const { entryId } = useParams<{ entryId: string }>();
  const manifest = useCourse();
  const router = useRouter();
  const { session } = useSession();
  const [entry, setEntry] = useState<EntryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setEntry(await api<EntryDto>(`/entries/${entryId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "couldn't load this page");
    }
  }, [entryId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <main className="px-6 pt-16"><ErrorNote message={error} /></main>;
  if (!entry) return <Loading label="finding the page…" />;

  const isAuthor = session?.user.id === entry.authorId;
  const lesson = entry.linkedLessonSlug
    ? manifest.weeks
        .flatMap((w) => w.lessons)
        .find((l) => l.slug === entry.linkedLessonSlug)
    : null;
  const photo = entry.photos[photoIdx];
  const authorHand = entry.authorColor === "blue" ? "text-sky" : "text-wood";

  async function addComment() {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api(`/entries/${entry!.id}/comments`, { method: "POST", body: { body: comment } });
      setComment("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("tear this page out of the book forever?")) return;
    await api(`/entries/${entry!.id}`, { method: "DELETE" });
    router.replace("/diary");
  }

  return (
    <main className="px-6 pt-12 pb-10">
      <div className="flex items-center justify-between mb-3">
        <Link href="/diary" className="font-bold text-accent text-[15px]">
          ‹ back to the book
        </Link>
        {isAuthor && (
          <button onClick={remove} className="text-xs text-inkFaint underline">
            tear out
          </button>
        )}
      </div>

      {photo && (
        <div className="mb-3">
          <Polaroid
            seed={entry.id}
            caption={
              entry.photos.length > 1
                ? `${photoIdx + 1} of ${entry.photos.length} — tap photo ›`
                : (photo.caption ?? undefined)
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={entry.title ?? "diary photo"}
              className="aspect-square w-full object-cover cursor-pointer"
              onClick={() => setPhotoIdx((photoIdx + 1) % entry.photos.length)}
            />
          </Polaroid>
        </div>
      )}

      <h1 className="font-hand text-4xl leading-tight">{entry.title ?? "a little moment"}</h1>
      <div className={`font-hand text-xl mt-1 mb-3 ${authorHand}`}>
        — {entry.authorName} · {friendlyDate(entry.entryDate)}
      </div>
      {entry.household && (
        <div className="mb-3 -mt-1">
          <Stamp color="gray">
            {entry.household.species === "cat" ? "🐱" : "🐶"} from the {entry.household.petName}{" "}
            diaries
          </Stamp>
        </div>
      )}

      {entry.note && (
        <p className="text-[15px] leading-7 whitespace-pre-wrap">{entry.note}</p>
      )}

      <div className="flex gap-2 mt-4 flex-wrap">
        {entry.mood && (
          <Stamp color={entry.mood === "milestone" ? "green" : "red"}>
            {MOOD_LABEL[entry.mood]}
          </Stamp>
        )}
      </div>

      {lesson && (
        <Link
          href={`/school/week-${String(lesson.week).padStart(2, "0")}/${lesson.slug.split("/")[1]}`}
          className="mt-5 flex items-center gap-2 bg-white border-[1.5px] border-wood rounded-md px-3.5 py-3 text-sm rotate-[0.4deg] active:opacity-80"
        >
          🎓 pinned to: <b>week {lesson.week} · {lesson.title}</b>
          <span className="ml-auto text-accent font-bold">view →</span>
        </Link>
      )}

      <div className="mt-7">
        {(entry.comments ?? []).map((c) => (
          <NoteCard key={c.id} seed={c.id} tape={false} className="mb-3 border-dashed">
            <div className="font-hand text-lg text-sky">
              {c.authorName}
              {c.authorHousehold ? ` (from ${c.authorHousehold.petName}'s book)` : ""} wrote in the
              margin:
            </div>
            <p className="text-sm">{c.body}</p>
          </NoteCard>
        ))}
        <div className="flex gap-2 mt-3">
          <input
            className="input-line flex-1"
            placeholder="write in the margin…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addComment();
            }}
          />
          <SketchButton onClick={addComment} disabled={busy || !comment.trim()} className="!w-auto !py-2 !px-4 !text-sm">
            ✎
          </SketchButton>
        </div>
      </div>
    </main>
  );
}
