"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { HandLabel, SketchButton, ErrorNote, NoteCard, Loading } from "@/components/scrapbook";

interface Preview {
  householdName: string;
  species: "dog" | "cat";
  petName: string;
  petBreed: string | null;
  invitedBy: string;
}

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { loading, session, household, refreshHousehold } = useSession();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Preview>(`/invites/${token}`, { auth: false })
      .then(setPreview)
      .catch(() => setNotFound(true));
  }, [token]);

  useEffect(() => {
    if (!loading && household) router.replace("/diary");
  }, [loading, household, router]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      if (!session) {
        const sb = supabase();
        const { error: upErr } = await sb.auth.signUp({ email, password });
        if (upErr) {
          // account may already exist — try signing in
          const { error: inErr } = await sb.auth.signInWithPassword({ email, password });
          if (inErr) throw new Error(upErr.message);
        }
      }
      await api(`/invites/${token}/accept`, { method: "POST", body: { displayName } });
      await refreshHousehold();
      router.replace("/diary");
    } catch (err) {
      setError(err instanceof Error ? err.message : "couldn't join");
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-[560px] px-8 pt-24">
        <NoteCard tape={false}>
          <div className="font-hand text-2xl text-accent">this invite has wandered off…</div>
          <p className="text-sm mt-1">
            It may have expired or been used already. Ask for a fresh link!
          </p>
        </NoteCard>
      </main>
    );
  }
  if (!preview) return <Loading label="reading the invite…" />;

  return (
    <main className="mx-auto max-w-[560px] px-8 pt-16 pb-10">
      <h1 className="font-hand text-4xl leading-tight">
        {preview.invitedBy} invited you to
        <br />
        <span className="text-accent">the {preview.petName} diaries {preview.species === "cat" ? "🐱" : "🐶"}</span>
      </h1>
      <p className="text-sm text-inkSoft mt-2">
        one {preview.petBreed ?? (preview.species === "cat" ? "very opinionated cat" : "very good dog")}, a few humans, every little moment — written down together.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void accept();
        }}
      >
        {!session && (
          <>
            <HandLabel>your email</HandLabel>
            <input
              className="input-line"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <HandLabel>choose a password</HandLabel>
            <input
              className="input-line"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </>
        )}
        <HandLabel>your name (how you&apos;ll sign your pages)</HandLabel>
        <input
          className="input-line"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Mei"
          required
          maxLength={40}
        />
        {error && <ErrorNote message={error} />}
        <div className="h-8" />
        <SketchButton type="submit" disabled={busy || !displayName}>
          {busy ? "joining the pack…" : `Join ${preview.petName}'s pack 🐾`}
        </SketchButton>
      </form>
    </main>
  );
}
