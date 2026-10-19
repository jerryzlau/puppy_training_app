-- Biru Cam: a camera pairs like a button pad (same claim flow, same device
-- token) but streams a live view instead of logging presses. See
-- hardware/CAM-PLAN.md. Additive only — existing devices stay button pads.

alter table public.devices
  add column type text not null default 'button_pad'
  check (type in ('button_pad', 'camera'));
