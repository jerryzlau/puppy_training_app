-- The Biru Diaries — initial schema
create extension if not exists pgcrypto;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Biru''s family',
  dog_name text not null default 'Biru',
  dog_breed text not null default 'Biewer Terrier',
  dog_birthday date,
  dog_photo_path text,
  created_by uuid references auth.users not null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid references public.households on delete cascade,
  user_id uuid references auth.users on delete cascade,
  display_name text not null,
  role text not null check (role in ('owner','member')),
  color text not null default 'red' check (color in ('red','blue','green','brown')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households on delete cascade not null,
  email text not null,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_by uuid references auth.users,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households on delete cascade not null,
  author_id uuid references auth.users not null,
  entry_date date not null,
  title text,
  note text,
  mood text check (mood in ('happy','sleepy','silly','dramatic','milestone')),
  linked_lesson_slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index diary_entries_household_date_idx
  on public.diary_entries (household_id, entry_date desc, created_at desc);

create table public.entry_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.diary_entries on delete cascade not null,
  storage_path text not null,
  caption text,
  position int not null default 0
);
create index entry_photos_entry_idx on public.entry_photos (entry_id, position);

create table public.entry_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.diary_entries on delete cascade not null,
  author_id uuid references auth.users not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index entry_comments_entry_idx on public.entry_comments (entry_id, created_at);

create table public.course_progress (
  household_id uuid references public.households on delete cascade not null,
  task_id text not null,
  checked_by uuid references auth.users not null,
  checked_at timestamptz not null default now(),
  primary key (household_id, task_id)
);
create index course_progress_household_time_idx
  on public.course_progress (household_id, checked_at desc);

-- updated_at trigger for diary_entries
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

create trigger diary_entries_updated_at
  before update on public.diary_entries
  for each row execute function public.set_updated_at();
