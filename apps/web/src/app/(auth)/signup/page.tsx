"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { HandLabel, SketchButton, ErrorNote, Loading } from "@/components/scrapbook";

export default function SignUp() {
  const router = useRouter();
  const { loading, session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.signUp({ email, password });
    setBusy(false);
    if (error) setError(error.message);
    else router.replace("/onboarding");
  }

  // Never paint the signed-out form until we know there is no session —
  // otherwise an already-signed-in user sees a login screen flash on load.
  useEffect(() => {
    if (!loading && session) router.replace("/");
  }, [loading, session, router]);

  if (loading || session) return <Loading label="opening the book…" />;

  return (
    <main className="px-8 pt-20 pb-10 min-h-dvh">
      <h1 className="font-hand text-5xl leading-none">a brand new book 📖</h1>
      <p className="text-sm text-inkSoft mt-2">
        make an account — the scrapbook comes right after.
      </p>
      <form onSubmit={submit}>
        <HandLabel>email</HandLabel>
        <input
          className="input-line"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <HandLabel>password (8+ characters)</HandLabel>
        <input
          className="input-line"
          type="password"
          value={password}
          minLength={8}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
        {error && <ErrorNote message={error} />}
        <div className="h-8" />
        <SketchButton type="submit" disabled={busy}>
          {busy ? "gluing pages…" : "Create account"}
        </SketchButton>
      </form>
      <p className="text-center text-sm text-inkSoft mt-5">
        already have one?{" "}
        <Link href="/signin" className="font-bold text-accent">
          open the book →
        </Link>
      </p>
    </main>
  );
}
