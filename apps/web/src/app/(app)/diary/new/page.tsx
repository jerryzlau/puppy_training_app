"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { uploadEntryPhoto } from "@/lib/photos";
import { MOODS, COURSE_MANIFEST, type EntryDto, type Mood } from "@biru/shared";
import { MOOD_LABEL } from "@/components/EntryCard";
import { HandLabel, SketchButton, ErrorNote, Loading } from "@/components/scrapbook";

const MAX_PHOTOS = 5;

function NewEntryForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [title, setTitle] = useState(params.get("title") ?? "");
  const [note, setNote] = useState("");
  const [mood, setMood] = useState<Mood | null>(
    (params.get("mood") as Mood | null) ?? null
  );
  const [lessonSlug, setLessonSlug] = useState<string>(params.get("lesson") ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
  const [entryDate, setEntryDate] = useState(today);

  // Built once: the manifest is static, and re-rendering 96 <option>s on every
  // keystroke is pure waste.
  const lessonOptions = useMemo(
    () =>
      COURSE_MANIFEST.weeks.flatMap((w) =>
        w.lessons.map((l) => (
          <option key={l.slug} value={l.slug}>
            {`week ${w.week} · ${l.title}`}
          </option>
        ))
      ),
    []
  );

  // One blob URL per file, not one per render. Creating these during render gave
  // every keystroke a fresh src and forced the browser to re-decode full-size
  // camera photos (and leaked a URL each time).
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function pickFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, MAX_PHOTOS));
  }

  async function save() {
    setBusy("gluing the page in…");
    setError(null);
    try {
      const entry = await api<EntryDto>("/entries", {
        method: "POST",
        body: {
          entryDate,
          title: title || null,
          note: note || null,
          mood,
          linkedLessonSlug: lessonSlug || null,
        },
      });
      for (let i = 0; i < files.length; i++) {
        setBusy(`developing photo ${i + 1} of ${files.length}…`);
        await uploadEntryPhoto(entry.id, files[i]);
      }
      router.replace(`/diary/${entry.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "couldn't save");
      setBusy(null);
    }
  }

  const dateLabel = new Date(`${entryDate}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <main className="px-6 pt-12 pb-10">
      <header className="flex items-center justify-between mb-2">
        <Link href="/diary" className="font-bold text-accent text-[15px]">
          ‹ close
        </Link>
        <h1 className="font-hand text-3xl">a new page</h1>
        <span className="w-12" />
      </header>

      <HandLabel>{dateLabel}</HandLabel>
      <input
        className="input-line"
        type="date"
        value={entryDate}
        max={today}
        onChange={(e) => setEntryDate(e.target.value)}
      />

      <HandLabel>a title for this memory</HandLabel>
      <input
        className="input-line"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="first off-leash zoomies!!"
        maxLength={120}
      />

      <HandLabel>photos ({files.length}/{MAX_PHOTOS})</HandLabel>
      <div className="flex gap-3 flex-wrap">
        {files.map((_, i) => (
          <div key={i} className="relative w-[104px]">
            <div className="bg-white p-1.5 pb-6 shadow-polaroid -rotate-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previews[i]}
                alt=""
                className="h-[84px] w-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-accent text-white text-xs border border-ink"
              aria-label="remove photo"
            >
              ✕
            </button>
          </div>
        ))}
        {files.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="w-[104px] h-[112px] border-[2.5px] border-dashed border-wood rounded-md flex flex-col items-center justify-center text-wood rotate-1"
          >
            <span className="text-2xl">📷</span>
            <span className="font-hand text-lg">add photo</span>
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => pickFiles(e.target.files)}
        />
      </div>

      <HandLabel>what happened?</HandLabel>
      <textarea
        className="ruled-textarea"
        rows={4}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="he tilted his head so hard he fell over…"
        maxLength={5000}
      />

      <HandLabel>mood stickers</HandLabel>
      <div className="flex gap-2 flex-wrap">
        {MOODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMood(mood === m ? null : m)}
            className={`px-3 py-1.5 rounded border-2 text-sm font-bold ${
              mood === m
                ? "border-accent bg-accent text-white"
                : "border-ruled bg-white text-inkSoft"
            }`}
          >
            {MOOD_LABEL[m]}
          </button>
        ))}
      </div>

      <HandLabel>pin to puppy school (optional)</HandLabel>
      <select
        className="input-line bg-white border-[1.5px] border-solid border-wood rounded-md px-3 py-2.5 text-sm"
        value={lessonSlug}
        onChange={(e) => setLessonSlug(e.target.value)}
      >
        <option value="">— not pinned —</option>
        {lessonOptions}
      </select>

      {error && <ErrorNote message={error} />}
      <div className="h-8" />
      <SketchButton onClick={save} disabled={Boolean(busy) || (!note && !title && files.length === 0)}>
        {busy ?? "Paste into the book ✂️"}
      </SketchButton>
    </main>
  );
}

export default function NewEntry() {
  return (
    <Suspense fallback={<Loading />}>
      <NewEntryForm />
    </Suspense>
  );
}
