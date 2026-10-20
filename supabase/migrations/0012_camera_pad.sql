-- Biru Cam: where the pee pad is in the camera's picture, drawn on the live
-- tab. {x, y, w, h} as fractions of the frame (0–1), like the detection boxes.
-- The Pi reads it from the relay replies and watches visits to that spot.
-- Additive only — null means "no pad marked", the camera's old behaviour.

alter table public.devices
  add column pad jsonb;
