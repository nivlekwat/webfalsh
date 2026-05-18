-- One-time setup. Paste into Supabase Dashboard → SQL Editor → Run.
-- Single-user app: the anon/publishable key has full access to this
-- table via the open RLS policies below. Tighten when adding multi-user.

create table if not exists public.progress (
  card_key text primary key,
  seen integer not null default 0,
  correct integer not null default 0,
  last_seen_at timestamptz not null default now(),
  last_correct_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

drop policy if exists "open_read"   on public.progress;
drop policy if exists "open_insert" on public.progress;
drop policy if exists "open_update" on public.progress;

create policy "open_read"   on public.progress for select using (true);
create policy "open_insert" on public.progress for insert with check (true);
create policy "open_update" on public.progress for update using (true) with check (true);

create or replace function public.progress_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists progress_updated_at on public.progress;
create trigger progress_updated_at
  before update on public.progress
  for each row execute function public.progress_set_updated_at();
