alter table public.vcard_profiles
  add column if not exists photo_removed_at timestamptz;

update public.vcard_profiles
set
  photo_data = null,
  photo_name = null,
  photo_removed_at = now(),
  updated_at = now()
where photo_data is not null
  and (
    lower(replace(photo_data, E'\\', '/')) like '%/mockups/%'
    or lower(photo_data) like '%profile-avatar.jpg%'
    or photo_data !~* '^data:image/(png|jpe?g|webp|gif);base64,'
  );

update public.profiles
set
  avatar_url = null,
  avatar_original_file_name = null,
  updated_at = now()
where avatar_url is not null
  and (
    lower(replace(avatar_url, E'\\', '/')) like '%/mockups/%'
    or lower(avatar_url) like '%profile-avatar.jpg%'
  );
