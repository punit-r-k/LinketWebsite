create table if not exists public.dashboard_notification_user_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id uuid not null references public.dashboard_notifications(id) on delete cascade,
  viewed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, notification_id),
  constraint dashboard_notification_user_states_has_action
    check (viewed_at is not null or dismissed_at is not null)
);

create index if not exists dashboard_notification_user_states_notification_idx
  on public.dashboard_notification_user_states (notification_id);

create index if not exists dashboard_notification_user_states_user_viewed_idx
  on public.dashboard_notification_user_states (user_id, viewed_at);

create index if not exists dashboard_notification_user_states_user_dismissed_idx
  on public.dashboard_notification_user_states (user_id, dismissed_at);

alter table public.dashboard_notification_user_states enable row level security;

do $policy$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dashboard_notification_user_states'
      and policyname = 'dashboard_notification_user_states_owner_select'
  ) then
    create policy dashboard_notification_user_states_owner_select
      on public.dashboard_notification_user_states
      for select
      using (
        auth.role() = 'service_role'
        or user_id = auth.uid()
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dashboard_notification_user_states'
      and policyname = 'dashboard_notification_user_states_owner_insert'
  ) then
    create policy dashboard_notification_user_states_owner_insert
      on public.dashboard_notification_user_states
      for insert
      with check (
        auth.role() = 'service_role'
        or user_id = auth.uid()
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dashboard_notification_user_states'
      and policyname = 'dashboard_notification_user_states_owner_update'
  ) then
    create policy dashboard_notification_user_states_owner_update
      on public.dashboard_notification_user_states
      for update
      using (
        auth.role() = 'service_role'
        or user_id = auth.uid()
      )
      with check (
        auth.role() = 'service_role'
        or user_id = auth.uid()
      );
  end if;
end
$policy$;
