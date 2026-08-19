"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { HandLabel, SketchButton, ErrorNote, Loading } from "@/components/scrapbook";

export default function Onboarding() {
  const router = useRouter();
  const { loading, session, household, refreshHousehold } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [dogName, setDogName] = useState("Biru");
  const [dogBirthday, setDogBirthday] = useState("");
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
          dogName,
          dogBreed: "Biewer Terrier",
          dogBirthday: dogBirthday || null,
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
        <HandLabel>your pup&apos;s name</HandLabel>
        <input
          className="input-line"
          value={dogName}
          onChange={(e) => setDogName(e.target.value)}
          required
          maxLength={40}
        />
        <HandLabel>his birthday (optional)</HandLabel>
        <input
          className="input-line"
          type="date"
          value={dogBirthday}
          onChange={(e) => setDogBirthday(e.target.value)}
        />
        {error && <ErrorNote message={error} />}
        <div className="h-8" />
        <SketchButton type="submit" disabled={busy || !displayName}>
          {busy ? "binding the book…" : "Start the scrapbook ✂️"}
        </SketchButton>
      </form>
    </main>
  );
}
