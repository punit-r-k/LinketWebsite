do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'user_profiles'
    ) then
      alter publication supabase_realtime add table public.user_profiles;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'profile_links'
    ) then
      alter publication supabase_realtime add table public.profile_links;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'lead_forms'
    ) then
      alter publication supabase_realtime add table public.lead_forms;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'vcard_profiles'
    ) then
      alter publication supabase_realtime add table public.vcard_profiles;
    end if;
  end if;
end $$;
