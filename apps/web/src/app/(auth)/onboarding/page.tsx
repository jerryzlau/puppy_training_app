"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Species } from "@biru/shared";
import { HandLabel, SketchButton, ErrorNote, Loading } from "@/components/scrapbook";

function OnboardingForm() {
  const params = useSearchParams();
  // only same-origin paths; "//host" would be a protocol-relative escape
  const rawReturn = params.get("returnTo") ?? "";
  const returnTo = rawReturn.startsWith("/") && !rawReturn.startsWith("//") ? rawReturn : null;
  const router = useRouter();
  const { loading, session, household, refreshHousehold } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [species, setSpecies] = useState<Species>("dog");
  const [noPet, setNoPet] = useState(false);
  const [petName, setPetName] = useState("");
  const [petBreed, setPetBreed] = useState("");
  const [petBirthday, setPetBirthday] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/signin");
    else if (household) router.replace(returnTo ?? "/diary");
  }, [loading, session, household, router, returnTo]);

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
          petName: noPet ? null : petName,
          petBreed: noPet ? null : petBreed.trim() || null,
          petBirthday: noPet ? null : petBirthday || null,
        },
      });
      await refreshHousehold();
      router.replace(returnTo ?? "/diary");
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
        <label className="flex items-center gap-2 text-sm text-inkSoft mb-2">
          <input
            type="checkbox"
            checked={noPet}
            onChange={(e) => setNoPet(e.target.checked)}
            className="w-4 h-4 accent-[#C0533E]"
          />
          no pet yet — I&apos;m here to follow my friends&apos; diaries
        </label>
        {!noPet && (
          <>
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
          </>
        )}
        {error && <ErrorNote message={error} />}
        <div className="h-8" />
        <SketchButton type="submit" disabled={busy || !displayName || (!noPet && !petName.trim())}>
          {busy ? "binding the book…" : "Start the scrapbook ✂️"}
        </SketchButton>
      </form>
    </main>
  );
}

export default function Onboarding() {
  return (
    <Suspense fallback={<Loading />}>
      <OnboardingForm />
    </Suspense>
  );
}
