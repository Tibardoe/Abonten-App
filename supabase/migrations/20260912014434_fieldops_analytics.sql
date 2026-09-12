-- Field Ops Phase 7: analytics.
--
-- Everything here is computed from the records the programme already
-- writes -- no counters, no rollup table, nothing anyone can type in. A
-- team of a dozen produces low thousands of rows per campaign, so the
-- indexes from Phases 1-6 are enough to aggregate live; if a pilot ever
-- shows these pages dragging, a `fieldops_daily_stat` table is the next
-- step, not a rewrite.
--
-- One deliberate choice: rates are returned as plain numerators and
-- denominators as well as the ratio, so a UI can say "3 of 4" rather than
-- only "75%" -- with numbers this small the fraction is the honest form.

create function public.fieldops_campaign_stats(p_campaign_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with camp as (
    select * from public.fieldops_campaign where id = p_campaign_id
  ),
  members as (
    select
      count(*) filter (where status <> 'left')                      as total,
      count(*) filter (where status = 'active')                     as active,
      count(*) filter (where status = 'invited')                    as invited,
      count(*) filter (where status = 'suspended')                  as suspended
    from public.fieldops_team_member where campaign_id = p_campaign_id
  ),
  terr as (
    select
      count(*)                                          as total,
      count(*) filter (where t.status = 'completed')     as completed,
      count(*) filter (where exists (
        select 1 from public.fieldops_assignment a
        where a.territory_id = t.id and a.campaign_id = p_campaign_id
          and a.status in ('assigned', 'started')))      as covered
    from public.fieldops_territory t
    join camp c on c.region_id = t.region_id
    where t.status <> 'retired'
  ),
  prospects as (
    select
      count(*)                                              as total,
      count(*) filter (where status <> 'identified')         as contacted,
      count(*) filter (where status = 'converted')           as converted
    from public.fieldops_prospect where campaign_id = p_campaign_id
  ),
  onboardings as (
    select
      count(*)                                          as total,
      count(*) filter (where status = 'draft')           as draft,
      count(*) filter (where status = 'submitted')       as submitted,
      count(*) filter (where status = 'needs_changes')   as needs_changes,
      count(*) filter (where status = 'verified')        as verified,
      count(*) filter (where status = 'flagged')         as flagged,
      count(*) filter (where status = 'succeeded')       as succeeded,
      count(*) filter (where status = 'rejected')        as rejected,
      count(*) filter (where status = 'withdrawn')       as withdrawn,
      count(*) filter (where kind = 'place')             as places,
      count(*) filter (where kind = 'event')             as events,
      count(*) filter (where activity_key = 'existing_place_claim_assist') as claim_assists
    from public.fieldops_onboarding where campaign_id = p_campaign_id
  ),
  content as (
    select
      count(*)                                       as total,
      count(*) filter (where status = 'submitted')    as waiting,
      count(*) filter (where status = 'approved')     as approved
    from public.fieldops_content_submission where campaign_id = p_campaign_id
  ),
  money as (
    select
      coalesce(sum(amount_minor) filter (where status = 'pending'), 0)   as pending_minor,
      coalesce(sum(amount_minor) filter (where status = 'approved'), 0)  as approved_minor,
      coalesce(sum(amount_minor) filter (where status = 'in_payout'), 0) as in_payout_minor,
      coalesce(sum(amount_minor) filter (where status = 'paid'), 0)      as paid_minor,
      count(*) filter (where status = 'pending')                          as pending_count,
      count(*) filter (where status = 'approved')                         as approved_count,
      count(*) filter (where status = 'paid' and reverses_commission_id is null) as paid_count
    from public.fieldops_commission where campaign_id = p_campaign_id
  )
  select jsonb_build_object(
    'campaignId', p_campaign_id,
    'status', (select status from camp),
    'currency', (select currency from camp),
    'members', to_jsonb(members.*),
    'territories', jsonb_build_object(
      'total', terr.total,
      'covered', terr.covered,
      'completed', terr.completed,
      'uncovered', greatest(terr.total - terr.covered - terr.completed, 0),
      'coveragePct', case when terr.total = 0 then 0
                          else round(((terr.covered + terr.completed)::numeric
                                      / terr.total) * 100, 1) end),
    'prospects', to_jsonb(prospects.*),
    'onboardings', to_jsonb(onboardings.*),
    'content', to_jsonb(content.*),
    'money', to_jsonb(money.*),
    -- What a successful onboarding actually cost: everything committed,
    -- over the number of successes. Null rather than zero when there are
    -- none yet, so the UI can say "not yet" instead of "GHS 0.00".
    'costPerSuccessMinor', case when onboardings.succeeded = 0 then null
      else round((money.approved_minor + money.in_payout_minor + money.paid_minor)::numeric
                 / onboardings.succeeded) end
  )
  from members, terr, prospects, onboardings, content, money;
$$;

-- Per member: what they did, and how much of it stood up. The lead sees
-- this for their own team; an admin sees it for any campaign.
create function public.fieldops_member_stats(p_campaign_id uuid)
returns table (
  member_id            uuid,
  member_user_id       uuid,
  full_name            text,
  role                 text,
  status               text,
  assigned_days        integer,
  prospects            integer,
  submitted            integer,
  verified             integer,
  succeeded            integer,
  rejected             integer,
  content_approved     integer,
  earned_minor         bigint,
  paid_minor           bigint,
  median_review_hours  numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    m.user_id,
    m.full_name_snapshot,
    m.role,
    m.status,
    coalesce((
      select sum((a.ends_on - a.starts_on) + 1)::integer
      from public.fieldops_assignment a
      where a.member_id = m.id and a.status <> 'cancelled'), 0),
    coalesce((select count(*) from public.fieldops_prospect p
              where p.member_id = m.id), 0)::integer,
    coalesce((select count(*) from public.fieldops_onboarding o
              where o.member_id = m.id and o.submitted_at is not null), 0)::integer,
    coalesce((select count(*) from public.fieldops_onboarding o
              where o.member_id = m.id
                and o.status in ('verified', 'flagged', 'succeeded')), 0)::integer,
    coalesce((select count(*) from public.fieldops_onboarding o
              where o.member_id = m.id and o.status = 'succeeded'), 0)::integer,
    coalesce((select count(*) from public.fieldops_onboarding o
              where o.member_id = m.id and o.status = 'rejected'), 0)::integer,
    coalesce((select count(*) from public.fieldops_content_submission cs
              where cs.member_id = m.id and cs.status = 'approved'), 0)::integer,
    -- Everything the programme has committed to them, paid or not.
    coalesce((select sum(c.amount_minor) from public.fieldops_commission c
              where c.member_id = m.id
                and c.status in ('approved', 'in_payout', 'paid')), 0),
    coalesce((select sum(c.amount_minor) from public.fieldops_commission c
              where c.member_id = m.id and c.status = 'paid'), 0),
    -- How long their work sat waiting for the lead, in hours.
    (select round(percentile_cont(0.5) within group (
              order by extract(epoch from o.reviewed_at - o.submitted_at) / 3600.0)::numeric, 1)
     from public.fieldops_onboarding o
     where o.member_id = m.id
       and o.submitted_at is not null and o.reviewed_at is not null)
  from public.fieldops_team_member m
  where m.campaign_id = p_campaign_id and m.status <> 'left'
  order by m.role, m.full_name_snapshot nulls last;
$$;

-- Per territory: the funnel from "someone we spoke to" to "listed and paid".
create function public.fieldops_territory_stats(p_campaign_id uuid)
returns table (
  territory_id    uuid,
  name            text,
  status          text,
  covered         boolean,
  prospects       integer,
  contacted       integer,
  submitted       integer,
  succeeded       integer,
  rejected        integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id,
    t.name,
    t.status,
    exists (select 1 from public.fieldops_assignment a
            where a.territory_id = t.id and a.campaign_id = p_campaign_id
              and a.status in ('assigned', 'started')),
    coalesce((select count(*) from public.fieldops_prospect p
              where p.territory_id = t.id and p.campaign_id = p_campaign_id), 0)::integer,
    coalesce((select count(*) from public.fieldops_prospect p
              where p.territory_id = t.id and p.campaign_id = p_campaign_id
                and p.status <> 'identified'), 0)::integer,
    coalesce((select count(*) from public.fieldops_onboarding o
              where o.territory_id = t.id and o.campaign_id = p_campaign_id
                and o.submitted_at is not null), 0)::integer,
    coalesce((select count(*) from public.fieldops_onboarding o
              where o.territory_id = t.id and o.campaign_id = p_campaign_id
                and o.status = 'succeeded'), 0)::integer,
    coalesce((select count(*) from public.fieldops_onboarding o
              where o.territory_id = t.id and o.campaign_id = p_campaign_id
                and o.status = 'rejected'), 0)::integer
  from public.fieldops_territory t
  join public.fieldops_campaign c on c.id = p_campaign_id
  where t.region_id = c.region_id and t.status <> 'retired'
  order by t.priority desc, t.name;
$$;

-- A day-by-day series for the charts. Every day in the window is returned,
-- including the empty ones, so a line chart has no invisible gaps.
create function public.fieldops_daily_series(
  p_campaign_id uuid,
  p_from date,
  p_to date
)
returns table (
  day             date,
  submitted       integer,
  verified        integer,
  succeeded       integer,
  rejected        integer,
  earned_minor    bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d::date,
    coalesce((select count(*) from public.fieldops_onboarding o
              where o.campaign_id = p_campaign_id
                and o.submitted_at >= d and o.submitted_at < d + interval '1 day'), 0)::integer,
    coalesce((select count(*) from public.fieldops_onboarding o
              where o.campaign_id = p_campaign_id
                and o.reviewed_at >= d and o.reviewed_at < d + interval '1 day'
                and o.review_decision = 'verified'), 0)::integer,
    coalesce((select count(*) from public.fieldops_onboarding o
              where o.campaign_id = p_campaign_id
                and o.succeeded_at >= d and o.succeeded_at < d + interval '1 day'), 0)::integer,
    coalesce((select count(*) from public.fieldops_onboarding o
              where o.campaign_id = p_campaign_id
                and o.rejected_at >= d and o.rejected_at < d + interval '1 day'), 0)::integer,
    coalesce((select sum(c.amount_minor) from public.fieldops_commission c
              where c.campaign_id = p_campaign_id
                and c.earned_at >= d and c.earned_at < d + interval '1 day'
                and c.reverses_commission_id is null), 0)
  from generate_series(
         p_from::timestamptz,
         least(p_to, p_from + 370)::timestamptz,
         interval '1 day') d
  order by d;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.fieldops_campaign_stats(uuid)',
    'public.fieldops_member_stats(uuid)',
    'public.fieldops_territory_stats(uuid)',
    'public.fieldops_daily_series(uuid, date, date)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- Rollback: drop the four functions.
