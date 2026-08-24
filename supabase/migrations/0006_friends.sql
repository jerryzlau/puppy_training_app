-- Friend households: two separate households link their books and can read
-- each other's diaries and comment on entries. Additive only — safe to run
-- before the code deploys.

-- Link-based, single-use friend invites (no email: they identify a household,
-- not a person). Same lifecycle as partner invites.
create table public.friend_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households on delete cascade not null,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_by uuid references auth.users,
  accepted_household_id uuid references public.households,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index friend_invites_household_idx
  on public.friend_invites (household_id, created_at desc);

-- One row per friendship. Canonical ordering (a < b) makes the pair unique and
-- structurally forbids self-friending (a < b is false when a = b).
create table public.household_friends (
  household_a uuid references public.households on delete cascade not null,
  household_b uuid references public.households on delete cascade not null,
  created_at timestamptz not null default now(),
  primary key (household_a, household_b),
  check (household_a < household_b)
);
create index household_friends_b_idx on public.household_friends (household_b);

-- helper: is the caller a member of some household friended with h?
create or replace function public.is_friend_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members m
    join public.household_friends f
      on (f.household_a = m.household_id and f.household_b = h)
      or (f.household_b = m.household_id and f.household_a = h)
    where m.user_id = auth.uid()
  );
$$;

alter table public.friend_invites enable row level security;
alter table public.household_friends enable row level security;

create policy "members manage friend invites" on public.friend_invites
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));

create policy "members read friendships" on public.household_friends
  for select using (public.is_member(household_a) or public.is_member(household_b));

-- Defense-in-depth friend reads (the API uses the service role and enforces
-- the same rules in code; these mirror the pattern set in 0002).
create policy "friends read household" on public.households
  for select using (public.is_friend_member(id));
create policy "friends read members" on public.household_members
  for select using (public.is_friend_member(household_id));
create policy "friends read entries" on public.diary_entries
  for select using (public.is_friend_member(household_id));
create policy "friends read photos" on public.entry_photos
  for select using (exists (
    select 1 from public.diary_entries e
    where e.id = entry_id and public.is_friend_member(e.household_id)));
create policy "friends read comments" on public.entry_comments
  for select using (exists (
    select 1 from public.diary_entries e
    where e.id = entry_id and public.is_friend_member(e.household_id)));
create policy "friends write comments" on public.entry_comments
  for insert with check (author_id = auth.uid() and exists (
    select 1 from public.diary_entries e
    where e.id = entry_id and public.is_friend_member(e.household_id)));

-- storage: friends may read photos under a friended household's prefix
create policy "friend households read photos"
  on storage.objects for select
  using (
    bucket_id = 'diary-photos'
    and public.is_friend_member(((storage.foldername(name))[1])::uuid)
  );
