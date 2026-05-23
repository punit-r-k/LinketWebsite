do $policy$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vcard_profiles'
      and policyname = 'vcard_profiles_public_select'
  ) then
    drop policy vcard_profiles_public_select on public.vcard_profiles;
  end if;
end
$policy$;

revoke select on table public.vcard_profiles from anon;
