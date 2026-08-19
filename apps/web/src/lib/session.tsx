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
  refreshHousehold: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState>({
  loading: true,
  configured: false,
  session: null,
  household: null,
  refreshHousehold: async () => {},
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const configured = isConfigured();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [household, setHousehold] = useState<HouseholdDto | null>(null);

  const refreshHousehold = useCallback(async () => {
    try {
      setHousehold(await api<HouseholdDto | null>("/households/me"));
    } catch {
      setHousehold(null);
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
      else setHousehold(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [configured, refreshHousehold]);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
    setHousehold(null);
  }, []);

  return (
    <Ctx.Provider value={{ loading, configured, session, household, refreshHousehold, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  return useContext(Ctx);
}
