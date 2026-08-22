"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { Loading } from "@/components/scrapbook";

export default function Home() {
  const { loading, configured, session, household, householdKnown } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!configured) return; // setup notice below
    if (!session) router.replace("/signin");
    else if (household) router.replace("/diary");
    else if (householdKnown) router.replace("/onboarding");
  }, [loading, configured, session, household, householdKnown, router]);

  if (!loading && !configured) {
    return (
      <main className="px-8 py-16">
        <h1 className="font-hand text-4xl mb-4">The Biru Diaries 🐶</h1>
        <p className="text-[15px] leading-7">
          Almost there! The app isn&apos;t connected to Supabase yet. Copy{" "}
          <code>.env.example</code> to <code>.env.local</code>, fill in your Supabase URL and anon
          key, and restart. See <code>RUNBOOK.md</code> for the full setup.
        </p>
      </main>
    );
  }
  return <Loading label="opening the book…" />;
}
