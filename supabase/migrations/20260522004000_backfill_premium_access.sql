create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.linket_complimentary_trial_claims') is not null
     and to_regclass('public.tag_assignments') is not null
     and to_regclass('public.hardware_tags') is not null
     and to_regclass('public.tag_events') is not null
     and to_regclass('public.subscription_billing_periods') is not null then
    insert into public.linket_complimentary_trial_claims (
      tag_id,
      user_id,
      assignment_id,
      source,
      accepted_at,
      starts_at,
      ends_at,
      created_at,
      updated_at
    )
    with current_assignments as (
      select
        ta.tag_id,
        ta.user_id,
        ta.id as assignment_id,
        coalesce(
          (
            select te.occurred_at
            from public.tag_events te
            where te.tag_id = ta.tag_id
              and te.event_type = 'claim'
              and (
                te.metadata->>'entitlement_user_id' = ta.user_id::text
                or te.metadata->>'claimer_user_id' = ta.user_id::text
                or te.metadata->>'user_id' = ta.user_id::text
              )
            order by te.occurred_at asc
            limit 1
          ),
          ht.last_claimed_at,
          ta.created_at,
          now()
        ) as accepted_at,
        coalesce(
          (
            select
              case
                when lower(coalesce(te.metadata->>'entitlement_source', '')) in (
                  'linket_claim',
                  'linket_transfer',
                  'admin_grant'
                )
                  then lower(te.metadata->>'entitlement_source')
                else null
              end
            from public.tag_events te
            where te.tag_id = ta.tag_id
              and te.event_type = 'claim'
              and (
                te.metadata->>'entitlement_user_id' = ta.user_id::text
                or te.metadata->>'claimer_user_id' = ta.user_id::text
                or te.metadata->>'user_id' = ta.user_id::text
              )
            order by te.occurred_at asc
            limit 1
          ),
          'linket_claim'
        ) as source
      from public.tag_assignments ta
      left join public.hardware_tags ht on ht.id = ta.tag_id
      where ta.user_id is not null
        and not exists (
          select 1
          from public.linket_complimentary_trial_claims existing
          where existing.tag_id = ta.tag_id
        )
    ),
    claim_windows as (
      select
        ca.tag_id,
        ca.user_id,
        ca.assignment_id,
        ca.source,
        ca.accepted_at,
        coalesce(
          (
            select sbp.period_end
            from public.subscription_billing_periods sbp
            where sbp.user_id = ca.user_id
              and sbp.provider = 'stripe'
              and sbp.status = 'paid'
              and sbp.period_start <= ca.accepted_at
              and sbp.period_end > ca.accepted_at
            order by sbp.period_end asc
            limit 1
          ),
          ca.accepted_at
        ) as starts_at
      from current_assignments ca
    )
    select
      tag_id,
      user_id,
      assignment_id,
      source,
      accepted_at,
      starts_at,
      starts_at + interval '12 months',
      now(),
      now()
    from claim_windows
    where starts_at is not null
    on conflict (tag_id) do nothing;
  end if;
end;
$$;

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
  v_claim_at timestamptz;
  v_period_end timestamptz;
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
      and table_name = 'admin_users'
  ) then
    execute $sql$
      select exists (
        select 1
        from public.admin_users
        where user_id = $1
      )
    $sql$
    into v_has_paid
    using target_user_id;

    if coalesce(v_has_paid, false) then
      return true;
    end if;
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

    if v_complimentary_start is not null
       and v_complimentary_end is not null
       and v_now >= v_complimentary_start
       and v_now < v_complimentary_end then
      return true;
    end if;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'tag_events'
  ) then
    execute $sql$
      select min(occurred_at)
      from public.tag_events
      where event_type = 'claim'
        and (
          metadata->>'entitlement_user_id' = $1::text
          or metadata->>'claimer_user_id' = $1::text
          or metadata->>'user_id' = $1::text
        )
    $sql$
    into v_claim_at
    using target_user_id;
  end if;

  if v_claim_at is null then
    return false;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'subscription_billing_periods'
  ) then
    execute $sql$
      select period_end
      from public.subscription_billing_periods
      where user_id = $1
        and provider = 'stripe'
        and status = 'paid'
        and period_start <= $2
        and period_end > $2
      order by period_end asc
      limit 1
    $sql$
    into v_period_end
    using target_user_id, v_claim_at;
  end if;

  v_complimentary_start := coalesce(v_period_end, v_claim_at);
  v_complimentary_end := v_complimentary_start + interval '12 months';

  return v_now >= v_complimentary_start and v_now < v_complimentary_end;
end;
$$;
