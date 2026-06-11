update public.profile_links
set
  link_type = 'resume',
  updated_at = now()
where link_type is distinct from 'resume'
  and (
    lower(coalesce(title, '')) in ('resume', 'my resume', 'cv', 'curriculum vitae')
    or lower(coalesce(url, '')) like '%/profile-resumes/%'
    or lower(coalesce(url, '')) like '%/storage/v1/object/public/profile-resumes/%'
    or (
      lower(coalesce(title, '')) like '%resume%'
      and lower(coalesce(url, '')) like '%.pdf%'
    )
  );
