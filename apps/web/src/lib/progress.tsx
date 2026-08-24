"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { ProgressCheckDto } from "@biru/shared";
import { COURSE_MANIFESTS, courseRollup } from "@biru/shared";
import { useCourse } from "./course";

interface ProgressState {
  loaded: boolean;
  checks: Map<string, ProgressCheckDto>;
  checkedSet: Set<string>;
  rollup: ReturnType<typeof courseRollup>;
  toggle: (taskId: string, on: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

const empty = courseRollup(COURSE_MANIFESTS.dog, new Set());

const Ctx = createContext<ProgressState>({
  loaded: false,
  checks: new Map(),
  checkedSet: new Set(),
  rollup: empty,
  toggle: async () => {},
  refresh: async () => {},
});

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const manifest = useCourse();
  const [checks, setChecks] = useState<Map<string, ProgressCheckDto>>(new Map());
  const [loaded, setLoaded] = useState(false);
  /** Ticks whose write is still in flight: taskId -> intended state. A server
   *  snapshot fetched before these landed must not erase them. */
  const pending = useRef(new Map<string, ProgressCheckDto | null>());
  /** Guards against out-of-order responses: only the newest snapshot applies. */
  const seq = useRef(0);

  /** Server truth, with any still-unacknowledged toggles laid back on top. */
  const applyPending = useCallback((server: Map<string, ProgressCheckDto>) => {
    const merged = new Map(server);
    pending.current.forEach((value, taskId) => {
      if (value) merged.set(taskId, value);
      else merged.delete(taskId);
    });
    return merged;
  }, []);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const data = await api<{ checks: ProgressCheckDto[] }>("/progress");
      if (mine !== seq.current) return; // a newer refresh already answered
      setChecks(applyPending(new Map(data.checks.map((c) => [c.taskId, c]))));
      setLoaded(true);
    } catch {
      /* stays stale */
    }
  }, [applyPending]);

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
      const optimistic: ProgressCheckDto | null = on
        ? {
            taskId,
            checkedBy: "me",
            checkedByName: "you",
            checkedAt: new Date().toISOString(),
          }
        : null;
      // Hold the intent until the server acknowledges it, so an in-flight
      // refresh started before this tap cannot undo it.
      pending.current.set(taskId, optimistic);
      setChecks((prev) => {
        const next = new Map(prev);
        if (optimistic) next.set(taskId, optimistic);
        else next.delete(taskId);
        return next;
      });
      try {
        await api(`/progress/${encodeURIComponent(taskId)}`, { method: on ? "PUT" : "DELETE" });
      } catch {
        // The write failed — drop the intent so the next refresh shows the truth.
        pending.current.delete(taskId);
        await refresh();
        return;
      }
      pending.current.delete(taskId);
      await refresh();
    },
    [refresh]
  );

  const checkedSet = new Set(checks.keys());
  const rollup = courseRollup(manifest, checkedSet);

  return (
    <Ctx.Provider value={{ loaded, checks, checkedSet, rollup, toggle, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export const useProgress = () => useContext(Ctx);
