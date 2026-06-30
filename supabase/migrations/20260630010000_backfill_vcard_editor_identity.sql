-- Seed existing contact cards from each account's public-profile editor before
-- the dashboard has to load and autosave those defaults.
--
-- Avatar files remain in the avatars storage bucket. The public vCard download
-- route embeds the current avatar directly from that bucket when photo_data is
-- empty, so copying binary image data into this table is unnecessary.

with active_editor_profiles as (
  select distinct on (user_id)
    user_id,
    case
      when lower(btrim(name)) = 'linket public profile' then null
      else nullif(btrim(name), '')
    end as name,
    nullif(btrim(handle), '') as handle,
    nullif(btrim(headline), '') as headline
  from public.user_profiles
  where is_active = true
  order by user_id, updated_at desc, created_at desc
),
editor_identity as (
  select
    account.user_id,
    coalesce(
      active_profile.name,
      case
        when lower(btrim(account.display_name)) = 'linket public profile'
          then null
        else nullif(btrim(account.display_name), '')
      end,
      active_profile.handle,
      nullif(btrim(account.username), '')
    ) as full_name,
    active_profile.headline as title
  from public.profiles as account
  left join active_editor_profiles as active_profile
    on active_profile.user_id = account.user_id
)
insert into public.vcard_profiles (
  user_id,
  full_name,
  title,
  updated_at
)
select
  user_id,
  full_name,
  title,
  now()
from editor_identity
where full_name is not null
on conflict (user_id) do update
set
  full_name = case
    when
      nullif(btrim(public.vcard_profiles.full_name), '') is null
      or lower(btrim(public.vcard_profiles.full_name)) = 'linket public profile'
      then excluded.full_name
    else public.vcard_profiles.full_name
  end,
  title = coalesce(
    nullif(btrim(public.vcard_profiles.title), ''),
    excluded.title
  ),
  updated_at = now()
where
  (
    (
      nullif(btrim(public.vcard_profiles.full_name), '') is null
      or lower(btrim(public.vcard_profiles.full_name)) = 'linket public profile'
    )
    and excluded.full_name is not null
  )
  or (
    nullif(btrim(public.vcard_profiles.title), '') is null
    and excluded.title is not null
  );
