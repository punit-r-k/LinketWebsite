create table if not exists public.linket_complimentary_trial_claims (
  tag_id uuid primary key references public.hardware_tags(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_id uuid references public.tag_assignments(id) on delete set null,
  source text not null default 'linket_claim'
    check (source in ('linket_claim', 'linket_transfer', 'admin_grant')),
  accepted_at timestamptz not null default now(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint linket_complimentary_trial_claims_valid_window
    check (ends_at > starts_at)
);

create index if not exists linket_complimentary_trial_claims_user_window_idx
  on public.linket_complimentary_trial_claims (user_id, starts_at, ends_at);

create index if not exists linket_complimentary_trial_claims_assignment_idx
  on public.linket_complimentary_trial_claims (assignment_id);

alter table public.linket_complimentary_trial_claims enable row level security;

do $policy$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'linket_complimentary_trial_claims'
      and policyname = 'linket_complimentary_trial_claims_owner_select'
  ) then
    create policy linket_complimentary_trial_claims_owner_select
      on public.linket_complimentary_trial_claims
      for select
      using (
        auth.role() = 'service_role'
        or user_id = auth.uid()
      );
  end if;
end
$policy$;

grant select on table public.linket_complimentary_trial_claims to authenticated;

create or replace function public.linket_user_has_paid_access(target_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_has_paid boolean := false;
  v_complimentary_start timestamptz;
  v_complimentary_end timestamptz;
begin
  if target_user_id is null then
    return false;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'subscription_billing_periods'
  ) then
    execute $sql$
      select exists (
        select 1
        from public.subscription_billing_periods
        where user_id = $1
          and provider = 'stripe'
          and status = 'paid'
          and period_start <= $2
          and period_end > $2
      )
    $sql$
      into v_has_paid
      using target_user_id, v_now;

    if coalesce(v_has_paid, false) then
      return true;
    end if;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'linket_complimentary_trial_claims'
  ) then
    execute $sql$
      select starts_at, ends_at
      from public.linket_complimentary_trial_claims
      where user_id = $1
        and starts_at <= $2
        and ends_at > $2
      order by ends_at desc
      limit 1
    $sql$
      into v_complimentary_start, v_complimentary_end
      using target_user_id, v_now;
  end if;

  return v_complimentary_start is not null
    and v_complimentary_end is not null
    and v_now >= v_complimentary_start
    and v_now < v_complimentary_end;
end;
$$;
