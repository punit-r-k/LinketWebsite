alter table public.user_profiles
  add column if not exists avatar_visible boolean not null default true;
