"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { ProgressProvider } from "@/lib/progress";
import { TabBar } from "@/components/TabBar";
import { Loading } from "@/components/scrapbook";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, configured, session, household } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!configured || !session) router.replace("/signin");
    else if (!household) router.replace("/onboarding");
  }, [loading, configured, session, household, router]);

  if (loading || !session || !household) return <Loading label="opening the book…" />;

  return (
    <ProgressProvider>
      <div className="pb-28">{children}</div>
      <TabBar />
    </ProgressProvider>
  );
}
