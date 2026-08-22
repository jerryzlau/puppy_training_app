"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { HouseholdDto } from "@biru/shared";
import { supabase, isConfigured } from "./supabase";
import { api } from "./api";

interface SessionState {
  loading: boolean;
  configured: boolean;
  session: Session | null;
  household: HouseholdDto | null;
  /** True once /households/me has actually answered. A failed request leaves this
   *  false so "the API is unreachable" is never mistaken for "no household yet". */
  householdKnown: boolean;
  refreshHousehold: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState>({
  loading: true,
  configured: false,
  session: null,
  household: null,
  householdKnown: false,
  refreshHousehold: async () => {},
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const configured = isConfigured();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [household, setHousehold] = useState<HouseholdDto | null>(null);
  const [householdKnown, setHouseholdKnown] = useState(false);

  const refreshHousehold = useCallback(async () => {
    try {
      // The API answers 200 with null when the caller has no household, so a
      // thrown error here is always a real failure — never "no household".
      setHousehold(await api<HouseholdDto | null>("/households/me"));
      setHouseholdKnown(true);
    } catch {
      // Leave the last known value alone; a cold container must not look like
      // a signed-out user and bounce them into onboarding.
    }
  }, []);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const sb = supabase();
    sb.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await refreshHousehold();
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      if (s) await refreshHousehold();
      else {
        setHousehold(null);
        setHouseholdKnown(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [configured, refreshHousehold]);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
    setHousehold(null);
    setHouseholdKnown(false);
  }, []);

  return (
    <Ctx.Provider
      value={{ loading, configured, session, household, householdKnown, refreshHousehold, signOut }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  return useContext(Ctx);
}
