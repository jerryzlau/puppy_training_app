-- Biru Buttons: physical buttons that log routine items for a household.
-- See hardware/PLAN.md §3–5. Additive only — safe to run before the code deploys.

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households on delete cascade not null,
  name text not null check (length(btrim(name)) > 0),
  -- sha256 of the device token; the token itself is shown once, to the device
  token_hash text unique,
  -- one-time, expiring pairing code (mirrors friend_invites)
  claim_code text unique,
  claim_expires_at timestamptz,
  claimed_at timestamptz,
  created_by uuid references auth.users not null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index devices_household_idx on public.devices (household_id, created_at desc);

-- provenance: which button (if any) logged a routine item
alter table public.routine_items
  add column device_id uuid references public.devices on delete set null;
-- dedupe key for device presses (retries after a timeout can't double-log)
alter table public.routine_items add column press_id uuid;
create unique index routine_items_press_id_idx
  on public.routine_items (press_id) where press_id is not null;

alter table public.devices enable row level security;
-- The API uses the service role; these mirror the rule in code.
create policy "members read devices" on public.devices
  for select using (public.is_member(household_id));
create policy "members manage devices" on public.devices
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));
