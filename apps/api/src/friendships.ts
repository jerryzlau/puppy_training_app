import { db } from "./supabase.js";

/** Household ids friended with the given household (either direction). */
export async function friendHouseholdIds(householdId: string): Promise<string[]> {
  const { data } = await db
    .from("household_friends")
    .select("household_a, household_b")
    .or(`household_a.eq.${householdId},household_b.eq.${householdId}`);
  return (data ?? []).map((r) => (r.household_a === householdId ? r.household_b : r.household_a));
}

/** Canonical (a < b) ordering for a friendship pair. */
export function canonicalPair(x: string, y: string): { a: string; b: string } {
  return x < y ? { a: x, b: y } : { a: y, b: x };
}

/** Does a friendship row exist between these two households? */
export async function areFriends(x: string, y: string): Promise<boolean> {
  const { a, b } = canonicalPair(x, y);
  const { data } = await db
    .from("household_friends")
    .select("household_a")
    .eq("household_a", a)
    .eq("household_b", b)
    .maybeSingle();
  return Boolean(data);
}
