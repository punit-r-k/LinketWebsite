alter table public.vcard_profiles
  add column if not exists contact_button_visible boolean not null default true;
