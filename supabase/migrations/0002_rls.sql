-- Row Level Security: every row is scoped to the caller's household membership.
-- The Railway API uses the service-role key (bypasses RLS) and enforces the same
-- rules in code; these policies are defense-in-depth for any direct client access.

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.invites enable row level security;
alter table public.diary_entries enable row level security;
alter table public.entry_photos enable row level security;
alter table public.entry_comments enable row level security;
alter table public.course_progress enable row level security;

-- helper: is the caller a member of the household?
create or replace function public.is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = h and m.user_id = auth.uid()
  );
$$;

-- households
create policy "members read household" on public.households
  for select using (public.is_member(id));
create policy "authed user creates household" on public.households
  for insert with check (auth.uid() = created_by);
create policy "owner updates household" on public.households
  for update using (
    exists (select 1 from public.household_members m
            where m.household_id = id and m.user_id = auth.uid() and m.role = 'owner')
  );

-- household_members
create policy "members read members" on public.household_members
  for select using (public.is_member(household_id));
create policy "self insert membership" on public.household_members
  for insert with check (user_id = auth.uid());

-- invites: members manage; invitee can read their own pending invite by email
create policy "members read invites" on public.invites
  for select using (
    public.is_member(household_id)
    or (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and status = 'pending')
  );
create policy "members create invites" on public.invites
  for insert with check (public.is_member(household_id));
create policy "members update invites" on public.invites
  for update using (
    public.is_member(household_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- diary entries
create policy "members read entries" on public.diary_entries
  for select using (public.is_member(household_id));
create policy "members create entries" on public.diary_entries
  for insert with check (public.is_member(household_id) and author_id = auth.uid());
create policy "author updates own entry" on public.diary_entries
  for update using (author_id = auth.uid());
create policy "author deletes own entry" on public.diary_entries
  for delete using (author_id = auth.uid());

-- entry photos / comments follow the entry's household
create policy "members read photos" on public.entry_photos
  for select using (exists (
    select 1 from public.diary_entries e
    where e.id = entry_id and public.is_member(e.household_id)));
create policy "members write photos" on public.entry_photos
  for insert with check (exists (
    select 1 from public.diary_entries e
    where e.id = entry_id and public.is_member(e.household_id)));
create policy "author deletes photos" on public.entry_photos
  for delete using (exists (
    select 1 from public.diary_entries e
    where e.id = entry_id and e.author_id = auth.uid()));

create policy "members read comments" on public.entry_comments
  for select using (exists (
    select 1 from public.diary_entries e
    where e.id = entry_id and public.is_member(e.household_id)));
create policy "members write comments" on public.entry_comments
  for insert with check (author_id = auth.uid() and exists (
    select 1 from public.diary_entries e
    where e.id = entry_id and public.is_member(e.household_id)));

-- course progress
create policy "members read progress" on public.course_progress
  for select using (public.is_member(household_id));
create policy "members check tasks" on public.course_progress
  for insert with check (public.is_member(household_id) and checked_by = auth.uid());
create policy "members uncheck tasks" on public.course_progress
  for delete using (public.is_member(household_id));
