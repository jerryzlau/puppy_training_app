-- Biru Cam: entries the camera logs by itself (CAM-PLAN.md §5). They're born
-- unconfirmed with a snapshot; a member taps ✓ (confirm) or ✗ (delete).
-- Additive only — every existing row (app, button) stays confirmed.

alter table public.routine_items
  add column confirmed boolean not null default true,
  -- path in the diary-photos bucket: {household_id}/routine/{item_id}.jpg
  add column snapshot_path text,
  -- the classifier's confidence, 0–1, for camera entries
  add column confidence real;

-- the forecast/bell/tally read only confirmed rows; pending ones are few
create index routine_items_unconfirmed_idx
  on public.routine_items (household_id, happened_at) where not confirmed;
