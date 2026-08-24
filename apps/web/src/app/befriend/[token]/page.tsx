"use client";

// Friend-link landing page. Unlike /join (which adds you to the inviter's
// household), accepting here requires you to ALREADY have your own household —
// it links two books rather than adding a member.

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

export default function BefriendPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { loading, session, household, refreshHousehold } = useSession();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Preview>(`/friend-invites/${token}`, { auth: false })
      .then(setPreview)
      .catch(() => setNotFound(true));
  }, [token]);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const sb = supabase();
      const { error: upErr } = await sb.auth.signUp({ email, password });
      if (upErr) {
        // account may already exist — try signing in
        const { error: inErr } = await sb.auth.signInWithPassword({ email, password });
        if (inErr) throw new Error(upErr.message);
      }
      await refreshHousehold();
    } catch (err) {
      setError(err instanceof Error ? err.message : "couldn't sign in");
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await api(`/friend-invites/${token}/accept`, { method: "POST" });
      router.replace("/diary?view=friends");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "couldn't link the books";
      if (msg === "already friends") {
        router.replace("/diary?view=friends");
        return;
      }
      setError(msg);
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-[560px] px-8 pt-24">
        <NoteCard tape={false}>
          <div className="font-hand text-2xl text-accent">this friend link has wandered off…</div>
          <p className="text-sm mt-1">It may have expired or been used already. Ask for a fresh one!</p>
        </NoteCard>
      </main>
    );
  }
  if (!preview || loading) return <Loading label="reading the invitation…" />;

  const emoji = preview.species === "cat" ? "🐱" : "🐶";

  return (
    <main className="mx-auto max-w-[560px] px-8 pt-16 pb-10">
      <h1 className="font-hand text-4xl leading-tight">
        {preview.invitedBy} wants to link books:
        <br />
        <span className="text-accent">
          the {preview.petName} diaries {emoji} × yours
        </span>
      </h1>
      <p className="text-sm text-inkSoft mt-2">
        friend books see each other&apos;s pages and can write in the margins. your book stays
        yours — this just opens the covers to each other.
      </p>

      {session && household && (
        <>
          {error && <ErrorNote message={error} />}
          <div className="h-6" />
          <SketchButton onClick={accept} disabled={busy}>
            {busy ? "linking the books…" : `Link our books 🐾`}
          </SketchButton>
        </>
      )}

      {session && !household && (
        <>
          <p className="text-sm mt-4">
            you need your own book first — set it up and we&apos;ll bring you right back here.
          </p>
          <div className="h-4" />
          <SketchButton href={`/onboarding?returnTo=${encodeURIComponent(`/befriend/${token}`)}`}>
            start my book first ✂️
          </SketchButton>
        </>
      )}

      {!session && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void signIn();
          }}
        >
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
          {error && <ErrorNote message={error} />}
          <div className="h-8" />
          <SketchButton type="submit" disabled={busy}>
            {busy ? "opening the door…" : "sign in to continue"}
          </SketchButton>
        </form>
      )}
    </main>
  );
}
