-- Security and scaling hardening from the June 2026 audit.
-- Public pages and forms should go through application routes, not direct anon
-- table or object access.

-- Restrict direct anonymous reads of public profile tables. The application
-- server still reads these via the service role and renders the public page.
drop policy if exists user_profiles_public_select on public.user_profiles;
drop policy if exists profile_links_public_select on public.profile_links;

revoke select on table public.user_profiles from anon;
revoke select on table public.profile_links from anon;

-- Legacy lead-form settings are no longer a public direct-read surface.
drop policy if exists lead_form_settings_public_select on public.lead_form_settings;
revoke select on table public.lead_form_settings from anon;

-- Public lead-form config is now served by /api/lead-forms/public through the
-- application, so the base table no longer needs anon select.
drop policy if exists lead_forms_public_select on public.lead_forms;
revoke select on table public.lead_forms from anon;

-- Anonymous inserts into application data tables bypass app rate limits and bot
-- checks. Public submissions now go through server routes using service-role
-- writes after validation.
drop policy if exists conversion_events_insert on public.conversion_events;
revoke insert on table public.conversion_events from anon;
revoke insert on table public.conversion_events from authenticated;

drop policy if exists consult_requests_insert on public.consult_requests;
revoke insert on table public.consult_requests from anon;
revoke insert on table public.consult_requests from authenticated;

drop policy if exists lead_form_responses_public_insert on public.lead_form_responses;
revoke insert on table public.lead_form_responses from anon;
revoke insert on table public.lead_form_responses from authenticated;

-- Uploaded lead-form attachments and resume PDFs can contain sensitive personal
-- data. Keep buckets private and serve files only through application routes
-- that verify ownership and issue short-lived signed URLs.
update storage.buckets
set public = false
where id in ('lead-form-uploads', 'profile-resumes');

drop policy if exists "Lead form uploads public read" on storage.objects;
drop policy if exists "Profile resumes public read" on storage.objects;

-- Hot-path lookup indexes.
create index if not exists user_profiles_public_active_handle_idx
  on public.user_profiles (handle)
  where is_active = true;

create index if not exists user_profiles_user_active_updated_idx
  on public.user_profiles (user_id, is_active, updated_at desc);

create index if not exists profile_links_profile_active_order_idx
  on public.profile_links (profile_id, is_active, order_index, created_at);

create index if not exists lead_forms_profile_status_updated_idx
  on public.lead_forms (profile_id, status, updated_at desc);

create index if not exists lead_forms_handle_status_updated_idx
  on public.lead_forms (handle, status, updated_at desc);

create index if not exists lead_form_responses_form_submitted_at_idx
  on public.lead_form_responses (form_id, submitted_at desc);

create index if not exists leads_user_created_at_idx
  on public.leads (user_id, created_at desc);

create index if not exists leads_user_flag_created_at_idx
  on public.leads (user_id, lead_flag, created_at desc);

create index if not exists conversion_events_user_event_created_idx
  on public.conversion_events (user_id, event_id, created_at desc);

create index if not exists conversion_events_public_profile_handle_idx
  on public.conversion_events (user_id, (meta->>'handle'), created_at desc)
  where event_id = 'public_profile_view';

create index if not exists tag_events_scan_owner_user_created_idx
  on public.tag_events ((metadata->>'owner_user_id'), occurred_at desc)
  where event_type = 'scan';

create index if not exists tag_events_scan_legacy_user_created_idx
  on public.tag_events ((metadata->>'user_id'), occurred_at desc)
  where event_type = 'scan';

create index if not exists tag_events_scan_tag_occurred_idx
  on public.tag_events (tag_id, occurred_at desc)
  where event_type = 'scan';

do $$
begin
  if to_regclass('public.profile_link_click_events') is not null then
    execute 'create index if not exists profile_link_click_events_user_occurred_idx on public.profile_link_click_events (user_id, occurred_at desc)';
    execute 'create index if not exists profile_link_click_events_link_occurred_idx on public.profile_link_click_events (link_id, occurred_at desc)';
  end if;
end
$$;
