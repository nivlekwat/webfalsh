-- Multi-user profiles + session tracking.
-- Run this AFTER the original supabase-schema.sql.

-- 1. Wipe existing progress (we're moving to per-profile rows).
delete from public.progress;

-- 2. Profiles table.
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '🐱',
  color text not null default '#3498db',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "open_read"   on public.profiles;
drop policy if exists "open_insert" on public.profiles;
drop policy if exists "open_update" on public.profiles;
drop policy if exists "open_delete" on public.profiles;
create policy "open_read"   on public.profiles for select using (true);
create policy "open_insert" on public.profiles for insert with check (true);
create policy "open_update" on public.profiles for update using (true) with check (true);
create policy "open_delete" on public.profiles for delete using (true);

-- 3. Make progress scoped to a profile.
alter table public.progress drop constraint if exists progress_pkey;
alter table public.progress add column if not exists profile_id uuid
  references public.profiles(id) on delete cascade;
alter table public.progress alter column profile_id set not null;
alter table public.progress add constraint progress_pkey primary key (profile_id, card_key);
create index if not exists progress_profile_idx on public.progress(profile_id);

-- 4. Sessions table — one row per study session.
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  cards_shown integer not null default 0,
  cards_correct integer not null default 0,
  cards_wrong integer not null default 0,
  cards_flipped integer not null default 0
);

alter table public.sessions enable row level security;
drop policy if exists "open_read"   on public.sessions;
drop policy if exists "open_insert" on public.sessions;
drop policy if exists "open_update" on public.sessions;
create policy "open_read"   on public.sessions for select using (true);
create policy "open_insert" on public.sessions for insert with check (true);
create policy "open_update" on public.sessions for update using (true) with check (true);
create index if not exists sessions_profile_idx on public.sessions(profile_id, started_at desc);
