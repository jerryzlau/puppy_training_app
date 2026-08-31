"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { type EntryDto, type FriendDto } from "@biru/shared";
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

/** First page sized to roughly one screenful of cards (plus a buffer row);
 *  later pages use the server default. Cursor pagination makes the sizes compose. */
function initialPageSize(): number {
  if (typeof window === "undefined") return 15;
  const columns = window.innerWidth >= 1024 ? 2 : 1; // lg: 2-col grid
  const rows = Math.ceil(window.innerHeight / 360) + 1; // ~photo card height
  return Math.min(15, Math.max(4, columns * rows));
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
  const [friends, setFriends] = useState<FriendDto[]>([]);
  /** null = everyone */
  const [friendFilter, setFriendFilter] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const [feed, s] = await Promise.all([
        api<Feed>(`/entries?limit=${initialPageSize()}`),
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

  const friendFeedUrl = useCallback(
    (cursor?: string | null) => {
      const parts = ["scope=friends"];
      if (friendFilter) parts.push(`household=${friendFilter}`);
      if (cursor) parts.push(`cursor=${encodeURIComponent(cursor)}`);
      else parts.push(`limit=${initialPageSize()}`);
      return `/entries?${parts.join("&")}`;
    },
    [friendFilter]
  );

  useEffect(() => {
    if (view !== "friends") return;
    let cancelled = false;
    setFriendState("loading");
    Promise.all([
      api<Feed>(friendFeedUrl()),
      friends.length
        ? Promise.resolve(null)
        : api<{ friends: FriendDto[] }>("/friends").catch(() => null),
    ])
      .then(([feed, fr]) => {
        if (cancelled) return;
        setFriendEntries(feed.entries);
        setFriendCursor(feed.nextCursor);
        if (fr) setFriends(fr.friends);
        setFriendState("ready");
      })
      .catch(() => !cancelled && setFriendState("error"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, friendFilter, friendFeedUrl]);

  async function loadMoreFriends() {
    if (!friendCursor) return;
    setLoadingMore(true);
    try {
      const feed = await api<Feed>(friendFeedUrl(friendCursor));
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

  const petName = household?.petName;
  const dayCount = household?.petBirthday
    ? Math.max(1, Math.floor((Date.now() - new Date(household.createdAt).getTime()) / 86_400_000) + 1)
    : Math.max(1, Math.floor((Date.now() - new Date(household?.createdAt ?? Date.now()).getTime()) / 86_400_000) + 1);

  return (
    <main className="px-5 pt-12">
      <header className="flex items-start justify-between mb-4 px-1">
        <div>
          <h1 className="font-hand text-[38px] leading-none">
            {petName ? `The ${petName} Diaries` : (household?.name ?? "Pet Diaries")}
          </h1>
          <Stamp className="mt-2">day {dayCount} · vol. 1</Stamp>
        </div>
        <Link
          href="/family"
          className="w-11 h-11 rounded-full bg-white border-2 border-ink flex items-center justify-center text-xl rotate-3 overflow-hidden"
          aria-label="family & settings"
        >
          {household?.petPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={household.petPhotoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            "🧑"
          )}
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
            every great scrapbook starts with one page. what happened today?
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
          {friends.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-2 mb-2 px-1 -mx-1" role="tablist" aria-label="filter by friend">
              <button
                type="button"
                role="tab"
                aria-selected={friendFilter === null}
                onClick={() => setFriendFilter(null)}
                className="flex flex-col items-center gap-1 shrink-0 w-[64px]"
              >
                <span
                  className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-xl bg-white ${
                    friendFilter === null ? "border-accent shadow-sketchSoft" : "border-ink opacity-70"
                  }`}
                  aria-hidden
                >
                  🐾
                </span>
                <span className={`text-[11px] font-bold truncate w-full text-center ${friendFilter === null ? "text-ink" : "text-inkFaint"}`}>
                  everyone
                </span>
              </button>
              {friends.map((f) => {
                const on = friendFilter === f.householdId;
                return (
                  <button
                    key={f.householdId}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setFriendFilter(on ? null : f.householdId)}
                    className="flex flex-col items-center gap-1 shrink-0 w-[64px]"
                  >
                    <span
                      className={`w-12 h-12 rounded-full border-2 overflow-hidden flex items-center justify-center text-xl bg-white ${
                        on ? "border-accent shadow-sketchSoft" : "border-ink opacity-70"
                      }`}
                    >
                      {f.petPhotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.petPhotoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span aria-hidden>{!f.hasPet ? "🧑" : f.species === "cat" ? "🐱" : "🐶"}</span>
                      )}
                    </span>
                    <span className={`text-[11px] font-bold truncate w-full text-center ${on ? "text-ink" : "text-inkFaint"}`}>
                      {f.petName}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
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
