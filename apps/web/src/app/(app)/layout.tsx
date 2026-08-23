"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { ProgressProvider } from "@/lib/progress";
import { TabBar } from "@/components/TabBar";
import { Loading } from "@/components/scrapbook";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, configured, session, household, householdKnown } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!configured || !session) router.replace("/signin");
    // Only when the API has actually told us there is no household — a failed
    // request must not eject a signed-in user into onboarding.
    else if (householdKnown && !household) router.replace("/onboarding");
  }, [loading, configured, session, household, householdKnown, router]);

  if (loading || !session || !household) return <Loading label="opening the book…" />;

  return (
    <ProgressProvider>
      {/* phones: a single 560px column above the tab bar.
          md+: content sits beside the sidebar and is free to grow. */}
      <div className="md:pl-[228px]">
        <div className="mx-auto max-w-[560px] pb-28 md:max-w-[760px] lg:max-w-[1040px] md:pb-12 md:px-6">
          {children}
        </div>
      </div>
      <TabBar />
    </ProgressProvider>
  );
}
