import { z } from "zod";

export const MOODS = ["happy", "sleepy", "silly", "dramatic", "milestone"] as const;
export type Mood = (typeof MOODS)[number];

export const MEMBER_COLORS = ["red", "blue", "green", "brown"] as const;
export type MemberColor = (typeof MEMBER_COLORS)[number];

// ---------- households ----------
export const SPECIES = ["dog", "cat"] as const;
export type Species = (typeof SPECIES)[number];

export const CreateHouseholdSchema = z.object({
  displayName: z.string().min(1).max(40),
  species: z.enum(SPECIES).default("dog"),
  petName: z.string().min(1).max(40),
  petBreed: z.string().min(1).max(60).nullable().optional(),
  petBirthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export type CreateHouseholdInput = z.infer<typeof CreateHouseholdSchema>;

export const UpdateHouseholdSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  petName: z.string().min(1).max(40).optional(),
  petBirthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  petPhotoPath: z.string().max(300).nullable().optional(),
});

// ---------- invites ----------
export const CreateInviteSchema = z.object({
  email: z.string().email(),
});

// ---------- diary ----------
export const CreateEntrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().max(120).nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
  mood: z.enum(MOODS).nullable().optional(),
  linkedLessonSlug: z.string().max(80).nullable().optional(),
});
export type CreateEntryInput = z.infer<typeof CreateEntrySchema>;

export const UpdateEntrySchema = CreateEntrySchema.partial();

export const CreateCommentSchema = z.object({
  body: z.string().min(1).max(1000),
});

export const SignPhotoSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  caption: z.string().max(140).nullable().optional(),
});

// ---------- API response shapes ----------
export interface MemberDto {
  userId: string;
  displayName: string;
  role: "owner" | "member";
  color: MemberColor;
  joinedAt: string;
}

export interface HouseholdDto {
  id: string;
  name: string;
  species: Species;
  petName: string;
  petBreed: string | null;
  petBirthday: string | null;
  petPhotoUrl: string | null;
  createdAt: string;
  members: MemberDto[];
}

export interface PhotoDto {
  id: string;
  url: string;
  caption: string | null;
  position: number;
}

export interface CommentDto {
  /** set when the comment comes from a friended household's member */
  authorHousehold?: { id: string; petName: string } | null;
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface EntryDto {
  id: string;
  authorId: string;
  authorName: string;
  authorColor: MemberColor;
  entryDate: string;
  title: string | null;
  note: string | null;
  mood: Mood | null;
  linkedLessonSlug: string | null;
  createdAt: string;
  photos: PhotoDto[];
  comments?: CommentDto[];
  /** present only on entries from a friended household (feed badge + detail) */
  household?: { id: string; petName: string; species: Species };
}

export interface ProgressCheckDto {
  taskId: string;
  checkedBy: string;
  checkedByName: string;
  checkedAt: string;
}

export interface ProgressStatsDto {
  totalTasks: number;
  checkedTasks: number;
  percent: number;
  lessonsDone: number;
  totalLessons: number;
  weeksDone: number;
  currentWeek: number;
  streakDays: number;
  perMember: { userId: string; displayName: string; color: MemberColor; count: number }[];
}

/* ── routine ─────────────────────────────────────────────────────────────── */

/** Case-folded form of a routine title, used to match "Walk" with "walk". */
export const routineKindKey = (kind: string): string => kind.trim().toLowerCase();

export const CreateRoutineItemSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.string().min(1).max(60),
  note: z.string().max(500).nullable().optional(),
  happenedAt: z.string().datetime({ offset: true }),
});
export type CreateRoutineItemInput = z.infer<typeof CreateRoutineItemSchema>;

export const UpdateRoutineItemSchema = z.object({
  kind: z.string().min(1).max(60).optional(),
  note: z.string().max(500).nullable().optional(),
  happenedAt: z.string().datetime({ offset: true }).optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export interface RoutineItemDto {
  id: string;
  day: string;
  kind: string;
  note: string | null;
  happenedAt: string;
  createdBy: string;
  createdByName: string;
}

/** A title you've used before — the quick-add chips, most-used first. */
export interface RoutineKindDto {
  kind: string;
  kindKey: string;
  count: number;
  lastUsedAt: string;
}

/** Time-of-day pattern for one kind, in minutes past local midnight. */
export interface RoutinePatternDto {
  kind: string;
  kindKey: string;
  count: number;
  medianMinutes: number;
  earliestMinutes: number;
  latestMinutes: number;
  /** Recent occurrences, newest first, as minutes past local midnight. */
  recentMinutes: number[];
}

/* ── friends ─────────────────────────────────────────────────────────────── */

export interface FriendDto {
  householdId: string;
  name: string;
  petName: string;
  species: Species;
  petBreed: string | null;
  petPhotoUrl: string | null;
  /** friendship created_at */
  since: string;
}

export interface FriendInviteDto {
  id: string;
  token: string;
  status: "pending" | "accepted" | "revoked";
  expiresAt: string;
  createdAt: string;
}
