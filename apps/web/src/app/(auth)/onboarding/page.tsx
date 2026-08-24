"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Species } from "@biru/shared";
import { HandLabel, SketchButton, ErrorNote, Loading } from "@/components/scrapbook";

export default function Onboarding() {
  const router = useRouter();
  const { loading, session, household, refreshHousehold } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [species, setSpecies] = useState<Species>("dog");
  const [petName, setPetName] = useState("");
  const [petBreed, setPetBreed] = useState("");
  const [petBirthday, setPetBirthday] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/signin");
    else if (household) router.replace("/diary");
  }, [loading, session, household, router]);

  if (loading || !session) return <Loading />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/households", {
        method: "POST",
        body: {
          displayName,
          species,
          petName,
          petBreed: petBreed.trim() || null,
          petBirthday: petBirthday || null,
        },
      });
      await refreshHousehold();
      router.replace("/diary");
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="px-8 pt-20 pb-10">
      <h1 className="font-hand text-5xl leading-none">who&apos;s in this story? ✏️</h1>
      <form onSubmit={submit}>
        <HandLabel>your name (how you&apos;ll sign your pages)</HandLabel>
        <input
          className="input-line"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Jerry"
          required
          maxLength={40}
        />
        <HandLabel>who is this book about?</HandLabel>
        <div className="flex gap-2 mb-1">
          {(
            [
              { value: "dog", label: "a dog 🐶" },
              { value: "cat", label: "a cat 🐱" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSpecies(opt.value)}
              className={`flex-1 px-3 py-2.5 rounded-lg border-2 text-[15px] font-bold ${
                species === opt.value
                  ? "border-accent bg-accent text-white"
                  : "border-ink bg-white text-inkSoft"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <HandLabel>their name</HandLabel>
        <input
          className="input-line"
          value={petName}
          onChange={(e) => setPetName(e.target.value)}
          placeholder={species === "dog" ? "Biru" : "Mochi"}
          required
          maxLength={40}
        />
        <HandLabel>breed (optional)</HandLabel>
        <input
          className="input-line"
          value={petBreed}
          onChange={(e) => setPetBreed(e.target.value)}
          placeholder={species === "dog" ? "Biewer Terrier" : "domestic shorthair"}
          maxLength={60}
        />
        <HandLabel>their birthday (optional)</HandLabel>
        <input
          className="input-line"
          type="date"
          value={petBirthday}
          onChange={(e) => setPetBirthday(e.target.value)}
        />
        {error && <ErrorNote message={error} />}
        <div className="h-8" />
        <SketchButton type="submit" disabled={busy || !displayName || !petName.trim()}>
          {busy ? "binding the book…" : "Start the scrapbook ✂️"}
        </SketchButton>
      </form>
    </main>
  );
}
