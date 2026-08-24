"use client";

import { COURSE_MANIFESTS, type CourseManifest, type Species } from "@biru/shared";
import { useSession } from "./session";

/** The household's species; defaults to dog until the household has loaded. */
export function useSpecies(): Species {
  return useSession().household?.species ?? "dog";
}

/** The curriculum for this household's species. */
export function useCourse(): CourseManifest {
  return COURSE_MANIFESTS[useSpecies()];
}

/** Copy that differs by species, in one place instead of scattered ternaries. */
export const SPECIES_COPY: Record<
  Species,
  { school: string; kind: string; emoji: string; curriculum: string }
> = {
  dog: { school: "Puppy School", kind: "pup", emoji: "🐶", curriculum: "puppy curriculum" },
  cat: { school: "Kitten School", kind: "cat", emoji: "🐱", curriculum: "cat curriculum" },
};
