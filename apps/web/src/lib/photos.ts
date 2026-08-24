"use client";

import imageCompression from "browser-image-compression";
import { api } from "./api";
import { supabase } from "./supabase";

const BUCKET = "diary-photos";

/** Compress client-side, get a signed upload slot from the API, upload direct to Supabase Storage. */
export async function uploadEntryPhoto(entryId: string, file: File, caption?: string) {
  const compressed = await imageCompression(file, {
    maxWidthOrHeight: 2000,
    maxSizeMB: 1.5,
    initialQuality: 0.85,
    useWebWorker: true,
  });
  const contentType = compressed.type === "image/png" ? "image/png" : "image/jpeg";
  const slot = await api<{ photoId: string; path: string; uploadUrl: string; token: string }>(
    `/entries/${entryId}/photos/sign`,
    { method: "POST", body: { contentType, caption: caption ?? null } }
  );
  const { error } = await supabase()
    .storage.from(BUCKET)
    .uploadToSignedUrl(slot.path, slot.token, compressed, { contentType });
  if (error) throw new Error(`photo upload failed: ${error.message}`);
  return slot.photoId;
}

/** Upload the pet's profile photo and save it on the household. */
export async function uploadDogPhoto(file: File) {
  const compressed = await imageCompression(file, {
    maxWidthOrHeight: 1200,
    maxSizeMB: 0.8,
    initialQuality: 0.85,
    useWebWorker: true,
  });
  const contentType = compressed.type === "image/png" ? "image/png" : "image/jpeg";
  const slot = await api<{ path: string; uploadUrl: string; token: string }>(
    "/households/me/photo/sign",
    { method: "POST", body: { contentType } }
  );
  const { error } = await supabase()
    .storage.from(BUCKET)
    .uploadToSignedUrl(slot.path, slot.token, compressed, { contentType });
  if (error) throw new Error(`photo upload failed: ${error.message}`);
  await api("/households/me", { method: "PATCH", body: { petPhotoPath: slot.path } });
}
