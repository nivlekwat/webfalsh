-- Focus areas: which tags a profile is currently studying.
-- Empty array = study the whole deck.
-- Run this in Supabase → SQL Editor.

alter table public.profiles
  add column if not exists focus_tags text[] not null default '{}';
