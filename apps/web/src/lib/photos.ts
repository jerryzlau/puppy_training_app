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
