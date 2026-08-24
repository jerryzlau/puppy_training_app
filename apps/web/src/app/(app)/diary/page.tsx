"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { type EntryDto } from "@biru/shared";
import { useCourse, useSpecies, SPECIES_COPY } from "@/lib/course";
import { EntryCard } from "@/components/EntryCard";
import { Stamp, SketchButton, Loading, ErrorNote, NoteCard } from "@/components/scrapbook";

interface Feed {
  entries: EntryDto[];
  nextCursor: string | null;
}

interface Stats {
  percent: number;
  currentWeek: number;
  streakDays: number;
}

function DiaryFeed() {
  const params = useSearchParams();
  const { household } = useSession();
  const manifest = useCourse();
  const species = useSpecies();
  const [view, setView] = useState<"book" | "friends">(
    params.get("view") === "friends" ? "friends" : "book"
  );
  const [entries, setEntries] = useState<EntryDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [friendEntries, setFriendEntries] = useState<EntryDto[]>([]);
  const [friendCursor, setFriendCursor] = useState<string | null>(null);
  const [friendState, setFriendState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [stats, setStats] = useState<Stats | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const [feed, s] = await Promise.all([
        api<Feed>("/entries"),
        api<Stats>("/progress/stats").catch(() => null),
      ]);
      setEntries(feed.entries);
      setCursor(feed.nextCursor);
      if (s) setStats(s);
      setState("ready");
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "couldn't load the book");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (view !== "friends" || friendState !== "idle") return;
    setFriendState("loading");
    api<Feed>("/entries?scope=friends")
      .then((feed) => {
        setFriendEntries(feed.entries);
        setFriendCursor(feed.nextCursor);
        setFriendState("ready");
      })
      .catch(() => setFriendState("error"));
  }, [view, friendState]);

  async function loadMoreFriends() {
    if (!friendCursor) return;
    setLoadingMore(true);
    try {
      const feed = await api<Feed>(
        `/entries?scope=friends&cursor=${encodeURIComponent(friendCursor)}`
      );
      setFriendEntries((prev) => [...prev, ...feed.entries]);
      setFriendCursor(feed.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const feed = await api<Feed>(`/entries?cursor=${encodeURIComponent(cursor)}`);
      setEntries((prev) => [...prev, ...feed.entries]);
      setCursor(feed.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  const petName = household?.petName ?? "Biru";
  const dayCount = household?.petBirthday
    ? Math.max(1, Math.floor((Date.now() - new Date(household.createdAt).getTime()) / 86_400_000) + 1)
    : Math.max(1, Math.floor((Date.now() - new Date(household?.createdAt ?? Date.now()).getTime()) / 86_400_000) + 1);

  return (
    <main className="px-5 pt-12">
      <header className="flex items-start justify-between mb-4 px-1">
        <div>
          <h1 className="font-hand text-[38px] leading-none">The {petName} Diaries</h1>
          <Stamp className="mt-2">day {dayCount} · vol. 1</Stamp>
        </div>
        <Link
          href="/family"
          className="w-11 h-11 rounded-full bg-white border-2 border-ink flex items-center justify-center text-xl rotate-3"
          aria-label="family & settings"
        >
          🧑
        </Link>
      </header>

      {/* view tabs */}
      <div className="flex gap-2 mb-4 px-1 md:max-w-[440px]">
        {(
          [
            { value: "book", label: "📖 our book" },
            { value: "friends", label: "🐾 friends" },
          ] as const
        ).map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setView(t.value)}
            aria-pressed={view === t.value}
            className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-bold ${
              view === t.value
                ? "border-ink bg-white shadow-sketchSoft text-ink"
                : "border-transparent text-inkFaint"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "book" && (
        <>
      {stats && (
        <Link
          href="/school"
          className="flex items-center gap-3 bg-white border-2 border-ink rounded-lg px-3.5 py-3 shadow-sketchSoft mb-6 -rotate-[0.5deg] active:opacity-80"
        >
          <span className="text-2xl" aria-hidden>
            🎓
          </span>
          <div className="flex-1">
            <div className="text-sm font-bold">
              {SPECIES_COPY[species].school.toLowerCase()} · week {stats.currentWeek} of {manifest.weeks.length}
            </div>
            <div className="text-xs text-inkSoft">
              {stats.percent}% of the course
              {stats.streakDays > 1 ? ` · 🔥 ${stats.streakDays}-day streak` : ""}
            </div>
          </div>
          <span className="font-hand text-xl text-accent">go →</span>
        </Link>
      )}

      {state === "loading" && <Loading />}
      {state === "error" && <ErrorNote message={errMsg} />}

      {state === "ready" && entries.length === 0 && (
        <NoteCard className="mt-8 text-center">
          <div className="font-hand text-3xl">an empty book, for now ✂️</div>
          <p className="text-sm text-inkSoft mt-2 mb-4">
            every great scrapbook starts with one page. what did {petName} do today?
          </p>
          <SketchButton href="/diary/new">paste in the first memory</SketchButton>
        </NoteCard>
      )}

      <div className="lg:grid lg:grid-cols-2 lg:gap-x-5 lg:items-start">
        {entries.map((e) => (
          <EntryCard key={e.id} entry={e} />
        ))}
      </div>

      {cursor && (
        <SketchButton variant="ghost" onClick={loadMore} disabled={loadingMore} className="mb-6">
          {loadingMore ? "flipping back…" : "earlier pages →"}
        </SketchButton>
      )}
        </>
      )}

      {view === "friends" && (
        <>
          {friendState === "loading" && <Loading label="fetching the neighbourhood…" />}
          {friendState === "error" && <ErrorNote message="couldn't load the friends feed" />}
          {friendState === "ready" && friendEntries.length === 0 && (
            <NoteCard className="mt-8 text-center">
              <div className="font-hand text-3xl">no friend books yet 🐾</div>
              <p className="text-sm text-inkSoft mt-2 mb-4">
                link books with a friend and their pages show up here next to yours.
              </p>
              <SketchButton href="/family">make a friend link</SketchButton>
            </NoteCard>
          )}
          <div className="lg:grid lg:grid-cols-2 lg:gap-x-5 lg:items-start">
            {friendEntries.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </div>
          {friendCursor && (
            <SketchButton
              variant="ghost"
              onClick={loadMoreFriends}
              disabled={loadingMore}
              className="mb-6"
            >
              {loadingMore ? "flipping back…" : "earlier pages →"}
            </SketchButton>
          )}
        </>
      )}

      <Link
        href="/diary/new"
        aria-label="new entry"
        className="fixed bottom-24 right-5 z-40 w-[60px] h-[60px] rounded-full bg-accent border-[2.5px] border-ink text-white text-[26px] flex items-center justify-center shadow-sketch active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      >
        ✏️
      </Link>
    </main>
  );
}

export default function DiaryPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DiaryFeed />
    </Suspense>
  );
}
