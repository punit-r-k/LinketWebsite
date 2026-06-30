-- Keep resume files private and repair legacy rows that still bypass the
-- application download route because they were saved as ordinary links.

insert into storage.buckets (id, name, public)
values ('profile-resumes', 'profile-resumes', false)
on conflict (id) do update
set public = excluded.public;

update public.profile_links
set
  link_type = 'resume',
  updated_at = now()
where link_type is distinct from 'resume'
  and (
    lower(coalesce(title, '')) in (
      'resume',
      'my resume',
      'cv',
      'curriculum vitae'
    )
    or lower(coalesce(title, '')) like '%resume%'
    or lower(coalesce(url, '')) like '%/profile-resumes/%'
    or lower(coalesce(url, '')) like
      '%/storage/v1/object/public/profile-resumes/%'
    or lower(coalesce(url, '')) like
      '%/storage/v1/object/sign/profile-resumes/%'
  );
