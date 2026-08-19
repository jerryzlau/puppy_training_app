"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import type { ProgressCheckDto } from "@biru/shared";
import { COURSE_MANIFEST, courseRollup } from "@biru/shared";

interface ProgressState {
  loaded: boolean;
  checks: Map<string, ProgressCheckDto>;
  checkedSet: Set<string>;
  rollup: ReturnType<typeof courseRollup>;
  toggle: (taskId: string, on: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

const empty = courseRollup(COURSE_MANIFEST, new Set());

const Ctx = createContext<ProgressState>({
  loaded: false,
  checks: new Map(),
  checkedSet: new Set(),
  rollup: empty,
  toggle: async () => {},
  refresh: async () => {},
});

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [checks, setChecks] = useState<Map<string, ProgressCheckDto>>(new Map());
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ checks: ProgressCheckDto[] }>("/progress");
      setChecks(new Map(data.checks.map((c) => [c.taskId, c])));
      setLoaded(true);
    } catch {
      /* stays stale */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const interval = setInterval(onFocus, 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [refresh]);

  const toggle = useCallback(
    async (taskId: string, on: boolean) => {
      // optimistic
      setChecks((prev) => {
        const next = new Map(prev);
        if (on)
          next.set(taskId, {
            taskId,
            checkedBy: "me",
            checkedByName: "you",
            checkedAt: new Date().toISOString(),
          });
        else next.delete(taskId);
        return next;
      });
      try {
        await api(`/progress/${encodeURIComponent(taskId)}`, { method: on ? "PUT" : "DELETE" });
        await refresh();
      } catch {
        await refresh(); // roll back to server truth
      }
    },
    [refresh]
  );

  const checkedSet = new Set(checks.keys());
  const rollup = courseRollup(COURSE_MANIFEST, checkedSet);

  return (
    <Ctx.Provider value={{ loaded, checks, checkedSet, rollup, toggle, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export const useProgress = () => useContext(Ctx);
