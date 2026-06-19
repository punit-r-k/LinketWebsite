alter table public.vcard_profiles
  add column if not exists additional_emails text[] not null default '{}',
  add column if not exists additional_phones text[] not null default '{}';

update public.vcard_profiles
set
  additional_emails = coalesce(additional_emails, '{}'),
  additional_phones = coalesce(additional_phones, '{}');
