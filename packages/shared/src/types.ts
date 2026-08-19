import { z } from "zod";

export const MOODS = ["happy", "sleepy", "silly", "dramatic", "milestone"] as const;
export type Mood = (typeof MOODS)[number];

export const MEMBER_COLORS = ["red", "blue", "green", "brown"] as const;
export type MemberColor = (typeof MEMBER_COLORS)[number];

// ---------- households ----------
export const CreateHouseholdSchema = z.object({
  displayName: z.string().min(1).max(40),
  dogName: z.string().min(1).max(40).default("Biru"),
  dogBreed: z.string().min(1).max(60).default("Biewer Terrier"),
  dogBirthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export type CreateHouseholdInput = z.infer<typeof CreateHouseholdSchema>;

export const UpdateHouseholdSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  dogName: z.string().min(1).max(40).optional(),
  dogBirthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dogPhotoPath: z.string().max(300).nullable().optional(),
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
  dogName: string;
  dogBreed: string;
  dogBirthday: string | null;
  dogPhotoUrl: string | null;
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
