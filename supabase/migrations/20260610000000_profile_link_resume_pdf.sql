alter table public.profile_links
  add column if not exists link_type text not null default 'link';

do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profile_links_link_type_check'
      and conrelid = 'public.profile_links'::regclass
  ) then
    alter table public.profile_links
      add constraint profile_links_link_type_check
      check (link_type in ('link', 'resume'));
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('profile-resumes', 'profile-resumes', true)
on conflict (id) do update set public = excluded.public;
