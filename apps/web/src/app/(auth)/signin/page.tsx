"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { HandLabel, SketchButton, ErrorNote, Polaroid, PawPlaceholder } from "@/components/scrapbook";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
    else router.replace("/");
  }

  return (
    <main className="px-8 pt-14 pb-10 min-h-dvh flex flex-col justify-center">
      <div className="w-[190px] mx-auto mb-6">
        <Polaroid caption="our Biru ♡" seed="login">
          <PawPlaceholder className="h-[170px] text-6xl" />
        </Polaroid>
      </div>
      <h1 className="font-hand text-5xl text-center leading-none">The Biru Diaries</h1>
      <p className="text-center text-sm text-inkSoft mt-2">a scrapbook of one very small dog</p>

      <form onSubmit={submit} className="mt-4">
        <HandLabel>email</HandLabel>
        <input
          className="input-line"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <HandLabel>password</HandLabel>
        <input
          className="input-line"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        {error && <ErrorNote message={error} />}
        <div className="h-7" />
        <SketchButton type="submit" disabled={busy}>
          {busy ? "opening…" : "Open the book ✂️"}
        </SketchButton>
      </form>
      <div className="h-3" />
      <SketchButton variant="ghost" href="/signup">
        Start a new scrapbook
      </SketchButton>
      <p className="text-center text-sm text-inkSoft mt-4">
        invited by your partner?{" "}
        <Link href="/signup" className="font-bold text-accent">
          use the link they sent you →
        </Link>
      </p>
    </main>
  );
}
