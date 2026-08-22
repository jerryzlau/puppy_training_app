-- Routine: a time-of-day log of what Bīru did and when.
-- A "routine for a day" is simply the set of rows sharing (household_id, day),
-- so there is no empty parent row to create or clean up.

create table public.routine_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households on delete cascade not null,
  -- the day this belongs to, in the household's local time
  day date not null,
  -- reusable title, e.g. "breakfast". kind_key is the case-folded form used for
  -- matching/reuse; kind keeps whatever casing was typed, for display.
  kind text not null check (length(btrim(kind)) > 0),
  kind_key text not null,
  note text,
  happened_at timestamptz not null,
  created_by uuid references auth.users not null,
  created_at timestamptz not null default now()
);

create index routine_items_day_idx
  on public.routine_items (household_id, day, happened_at);
-- backs the quick-add chips (distinct kinds by frequency) and the pattern strip
create index routine_items_kind_idx
  on public.routine_items (household_id, kind_key, happened_at desc);

alter table public.routine_items enable row level security;

create policy "members read routine" on public.routine_items
  for select using (public.is_member(household_id));
create policy "members create routine" on public.routine_items
  for insert with check (public.is_member(household_id) and created_by = auth.uid());
create policy "members update routine" on public.routine_items
  for update using (public.is_member(household_id));
create policy "members delete routine" on public.routine_items
  for delete using (public.is_member(household_id));
