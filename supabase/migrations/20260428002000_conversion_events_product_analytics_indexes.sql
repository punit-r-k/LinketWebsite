create index if not exists conversion_events_created_at_idx
  on public.conversion_events (created_at desc);

create index if not exists conversion_events_event_user_created_idx
  on public.conversion_events (event_id, user_id, created_at desc);

create index if not exists conversion_events_onboarding_step_created_idx
  on public.conversion_events ((meta->>'step_id'), created_at desc)
  where event_id in ('onboarding_step_viewed', 'onboarding_step_completed');
