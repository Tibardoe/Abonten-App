-- Spotlight promotions: from fixed time plans to a budget-and-reach product.
--
-- Before: the advertiser bought a preset ("GH₵ 50 for 3 days") and spend
-- accrued by the hour whether anyone saw the post or not.
--
-- After: the advertiser chooses a budget, an audience and a maximum run
-- length. The server prices it from content_promotion_pricing (editable in
-- Admin, versioned, snapshotted onto each campaign) into an impression goal
-- (budget ÷ cost per 1,000 sponsored impressions) and shows an ESTIMATED
-- reach range built from observed audience data. Nothing is guaranteed.
-- Spend is recognised only for valid, de-duplicated sponsored impressions
-- actually delivered, capped at the amount paid. A campaign stops when its
-- impression goal is delivered, its run ends, it is cancelled, staff pause
-- or reject it, or its post / publisher stops being eligible. Unused budget
-- stays refundable (content_campaign_refundable_minor), exactly as before.
--
-- Also here:
--   * sponsored_delivery_enabled: staff can stop sponsored delivery without
--     stopping organic Spotlight or new sales (and vice versa).
--   * Delivery pacing and fair rotation between campaigns (least delivered
--     against plan first), advertisers never see their own promotion, and a
--     restricted author or hidden publisher place is never sponsored.
--   * Unique reach and completions per campaign; a metrics function that
--     keeps reach, impressions, meaningful views, completions, clicks,
--     follows and conversions separate.
--   * Activation checks the verified transaction amount equals the budget.
--   * Refund accrues outstanding delivery first, so a refund never returns
--     money for impressions already delivered.
--
-- Production had no campaigns when this ran, so the preset columns and
-- table are dropped rather than migrated.

-- ---------------------------------------------------------------------
-- 1. Pricing and estimation assumptions (one row, admin-editable)
-- ---------------------------------------------------------------------
create table public.content_promotion_pricing (
  id                           smallint    primary key default 1 check (id = 1),
  currency                     text        not null default 'GHS',
  min_budget_minor             bigint      not null default 2000   check (min_budget_minor >= 100),
  max_budget_minor             bigint      not null default 500000 check (max_budget_minor <= 10000000),
  budget_step_minor            bigint      not null default 500    check (budget_step_minor between 1 and 100000),
  suggested_budgets_minor      bigint[]    not null default '{2000,5000,10000}',
  duration_options_days        smallint[]  not null default '{3,7,14}',
  default_duration_days        smallint    not null default 7      check (default_duration_days between 1 and 60),
  -- What 1,000 delivered sponsored impressions cost, in pesewas.
  cpm_minor                    integer     not null default 1100   check (cpm_minor between 10 and 1000000),
  -- Average sponsored impressions per person reached (reach = impressions ÷ frequency).
  avg_frequency                numeric     not null default 1.5    check (avg_frequency between 1 and 10),
  -- Half-width of the estimate range (2000 = ±20 %).
  estimate_spread_bps          smallint    not null default 2000   check (estimate_spread_bps between 0 and 5000),
  -- Assumed audience when observed data is thin. 0 = use observed data only.
  audience_floor_daily_viewers integer     not null default 0      check (audience_floor_daily_viewers >= 0),
  audience_floor_reach         integer     not null default 0      check (audience_floor_reach >= 0),
  -- Share of a viewer's daily sponsored cap a campaign can expect to fill.
  daily_fill_bps               smallint    not null default 3000   check (daily_fill_bps between 1 and 10000),
  -- The most of the audience one campaign can expect to reach.
  max_reach_share_bps          smallint    not null default 6000   check (max_reach_share_bps between 1 and 10000),
  -- Share of the audience left when a location / category target is set.
  location_audience_share_bps  smallint    not null default 3000   check (location_audience_share_bps between 1 and 10000),
  category_audience_share_bps  smallint    not null default 5000   check (category_audience_share_bps between 1 and 10000),
  -- Refuse to sell a budget when the forecast delivers less than this share of it.
  min_deliverable_bps          smallint    not null default 5000   check (min_deliverable_bps between 0 and 10000),
  -- Delivery may run this many times ahead of an even pace.
  pacing_multiplier            numeric     not null default 2.0    check (pacing_multiplier between 1 and 20),
  version                      integer     not null default 1,
  updated_at                   timestamptz not null default now(),
  updated_by                   uuid,
  constraint content_promotion_pricing_budget_range check (max_budget_minor >= min_budget_minor)
);

comment on table public.content_promotion_pricing is
  'Spotlight promotion pricing and reach-estimate assumptions (one row). Edited from Admin › Spotlight & Stories › Settings (step-up, audited); version increments on every change and is snapshotted onto each campaign. Estimates are guidance, never a promise.';

insert into public.content_promotion_pricing (id) values (1) on conflict do nothing;

-- Observed audience, refreshed nightly from validated feed impressions.
create table public.content_audience_snapshot (
  id             smallint    primary key default 1 check (id = 1),
  daily_viewers  integer     not null default 0,
  reach_28d      integer     not null default 0,
  days_observed  smallint    not null default 0,
  computed_at    timestamptz
);

comment on table public.content_audience_snapshot is
  'Aggregate Spotlight audience for the promotion estimator: average daily distinct viewing devices over the last 14 days and distinct devices over 28 days on the surfaces that carry sponsored posts. Counts only; no identifiers.';

insert into public.content_audience_snapshot (id) values (1) on conflict do nothing;

create or replace function public.content_audience_refresh()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_daily integer;
  v_days  integer;
  v_reach integer;
begin
  select coalesce(round(avg(d.n)), 0)::integer, count(*)::integer into v_daily, v_days
  from (
    select (v.created_at at time zone 'utc')::date as day, count(distinct v.viewer_key) as n
    from public.content_view v
    where v.kind = 'impression' and v.valid
      and v.surface in ('for_you', 'nearby', 'trending')
      and v.created_at >= (now() at time zone 'utc')::date - 14
      and v.created_at < (now() at time zone 'utc')::date
    group by 1
  ) d;

  select count(distinct v.viewer_key)::integer into v_reach
  from public.content_view v
  where v.kind = 'impression' and v.valid
    and v.surface in ('for_you', 'nearby', 'trending')
    and v.created_at >= now() - interval '28 days';

  update public.content_audience_snapshot
  set daily_viewers = v_daily, reach_28d = v_reach, days_observed = v_days, computed_at = now()
  where id = 1;
  return jsonb_build_object('daily_viewers', v_daily, 'reach_28d', v_reach, 'days_observed', v_days);
end;
$$;

revoke all on function public.content_audience_refresh() from public, anon, authenticated;
grant execute on function public.content_audience_refresh() to service_role;

-- ---------------------------------------------------------------------
-- 2. Separate switch for sponsored delivery
-- ---------------------------------------------------------------------
alter table public.content_program_setting
  add column if not exists sponsored_delivery_enabled boolean not null default true;

comment on column public.content_program_setting.sponsored_delivery_enabled is
  'Serve active promotions in feeds. Off = no sponsored posts shown (campaigns deliver nothing and are not charged); organic Spotlight is unaffected. spotlight_promotions_enabled separately controls selling new promotions.';

-- ---------------------------------------------------------------------
-- 3. Campaigns carry their pricing snapshot and delivery counters
-- ---------------------------------------------------------------------
alter table public.content_campaign drop column if exists preset_id;
alter table public.content_campaign_checkout drop column if exists preset_id;
drop table if exists public.content_campaign_preset;

alter table public.content_campaign
  add column pricing_version       integer not null,
  add column cpm_minor             integer not null check (cpm_minor > 0),
  add column impression_goal       bigint  not null check (impression_goal > 0),
  add column estimated_impressions bigint  not null default 0 check (estimated_impressions >= 0),
  add column estimated_reach_low   integer not null default 0 check (estimated_reach_low >= 0),
  add column estimated_reach_high  integer not null default 0 check (estimated_reach_high >= estimated_reach_low),
  add column estimate_basis        text    not null default 'observed'
                                     check (estimate_basis in ('observed', 'assumed', 'no_data')),
  add column reach_count           integer not null default 0 check (reach_count >= 0),
  add column completion_count      integer not null default 0 check (completion_count >= 0),
  add column end_reason            text    check (end_reason is null or end_reason in ('budget_delivered', 'run_ended'));

comment on column public.content_campaign.duration_days is
  'The longest the campaign may run once approved. A delivery limit, not what is sold.';
comment on column public.content_campaign.impression_goal is
  'Sponsored impressions the budget pays for: floor(budget_minor × 1000 ÷ cpm_minor). Delivery stops when reached.';
comment on column public.content_campaign.reach_count is
  'Distinct viewing devices that received at least one valid sponsored impression of this campaign.';

create index if not exists idx_content_view_campaign_viewer
  on public.content_view (campaign_id, viewer_key)
  where campaign_id is not null and kind = 'impression' and valid;

-- ---------------------------------------------------------------------
-- 4. Telemetry: campaign impressions (capped at the goal), reach, views,
--    completions. Otherwise identical to 20260916120100.
-- ---------------------------------------------------------------------
create or replace function public.content_view_ingest(
  p_viewer     uuid,
  p_viewer_key text,
  p_events     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s          public.content_program_setting%rowtype;
  e          jsonb;
  v_post     public.content_post%rowtype;
  v_kind     text;
  v_watched  integer;
  v_surface  text;
  v_campaign uuid;
  v_valid    boolean;
  v_reason   text;
  v_recent   integer;
  v_accepted integer := 0;
  v_invalid  integer := 0;
  v_n        integer := 0;
  v_view_id  bigint;
  v_day      date := (now() at time zone 'utc')::date;
begin
  select * into s from public.content_program_setting where id = 1;
  if p_viewer_key is null or length(p_viewer_key) < 8 then
    return jsonb_build_object('accepted', 0, 'invalid', 0, 'error', 'viewer_key');
  end if;

  select count(*) into v_recent
  from public.content_view v
  where v.viewer_key = p_viewer_key and v.created_at > now() - interval '1 minute';

  for e in select * from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) loop
    v_n := v_n + 1;
    exit when v_n > 100;
    v_valid := true;
    v_reason := null;
    v_kind := e ->> 'kind';
    v_watched := greatest(coalesce((e ->> 'watchedMs')::integer, 0), 0);
    v_surface := coalesce(e ->> 'surface', 'for_you');
    v_campaign := null;

    if v_kind not in ('impression', 'view_start', 'meaningful_view', 'completion', 'replay') then
      continue;
    end if;
    if v_surface not in ('for_you', 'following', 'nearby', 'happening_soon', 'trending',
                         'stories', 'profile', 'deep_link', 'search', 'embed') then
      v_surface := 'for_you';
    end if;

    begin
      select * into v_post from public.content_post p where p.id = (e ->> 'postId')::uuid;
    exception when others then
      continue;
    end;
    if not found then continue; end if;

    if not public.content_post_is_public(v_post.status, v_post.moderation_state, v_post.kind, v_post.published_at, v_post.expires_at) then
      v_valid := false; v_reason := 'post_unavailable';
    elsif p_viewer is not null and p_viewer = v_post.author_id then
      v_valid := false; v_reason := 'self';
    elsif v_recent + v_n > s.views_per_viewer_per_minute then
      v_valid := false; v_reason := 'rate_limited';
    elsif v_watched > 86400000 then
      v_valid := false; v_reason := 'implausible_watch_time';
    elsif v_kind in ('impression', 'view_start') and exists (
      select 1 from public.content_view v
      where v.viewer_key = p_viewer_key and v.post_id = v_post.id and v.kind = v_kind and v.valid
        and v.created_at > now() - interval '1 hour') then
      v_valid := false; v_reason := 'duplicate';
    elsif v_kind = 'meaningful_view' and v_watched < s.meaningful_view_ms then
      v_valid := false; v_reason := 'too_short';
    elsif v_kind in ('meaningful_view', 'completion') and exists (
      select 1 from public.content_view v
      where v.viewer_key = p_viewer_key and v.post_id = v_post.id and v.kind = v_kind and v.valid
        and v.created_at >= v_day) then
      v_valid := false; v_reason := 'duplicate';
    elsif v_kind = 'replay' and not exists (
      select 1 from public.content_view v
      where v.viewer_key = p_viewer_key and v.post_id = v_post.id and v.valid
        and v.kind in ('meaningful_view', 'completion') and v.created_at >= v_day) then
      v_valid := false; v_reason := 'replay_without_view';
    end if;

    -- A campaign id only counts when that campaign is live for this post
    -- and, for an impression, still has impressions left to deliver.
    if (e ->> 'campaignId') is not null then
      begin
        select c.id into v_campaign
        from public.content_campaign c
        where c.id = (e ->> 'campaignId')::uuid and c.post_id = v_post.id
          and c.status = 'active' and c.starts_at <= now() and c.ends_at > now()
          and (v_kind <> 'impression' or c.impression_count < c.impression_goal);
      exception when others then
        v_campaign := null;
      end;
    end if;

    insert into public.content_view (post_id, viewer_id, viewer_key, kind, watched_ms, surface, campaign_id, valid, invalid_reason)
    values (v_post.id, p_viewer, p_viewer_key, v_kind, v_watched, v_surface, v_campaign, v_valid, v_reason)
    returning id into v_view_id;

    if v_valid then
      v_accepted := v_accepted + 1;
      if v_kind = 'impression' then
        update public.content_post set impression_count = impression_count + 1 where id = v_post.id;
        if v_campaign is not null then
          update public.content_campaign c
          set impression_count = c.impression_count + 1,
              reach_count = c.reach_count + case when exists (
                select 1 from public.content_view v
                where v.campaign_id = v_campaign and v.viewer_key = p_viewer_key
                  and v.kind = 'impression' and v.valid and v.id <> v_view_id) then 0 else 1 end
          where c.id = v_campaign and c.impression_count < c.impression_goal;
        end if;
      elsif v_kind = 'meaningful_view' then
        update public.content_post set view_count = view_count + 1 where id = v_post.id;
        if v_campaign is not null then
          update public.content_campaign set view_count = view_count + 1 where id = v_campaign;
        end if;
      elsif v_kind = 'completion' and v_campaign is not null then
        update public.content_campaign set completion_count = completion_count + 1 where id = v_campaign;
      end if;
      if v_post.kind = 'story' and p_viewer is not null and v_kind in ('view_start', 'meaningful_view', 'completion') then
        insert into public.content_story_seen (post_id, viewer_id, completed)
        values (v_post.id, p_viewer, v_kind = 'completion')
        on conflict (post_id, viewer_id) do update
          set last_seen_at = now(), completed = public.content_story_seen.completed or excluded.completed;
      end if;
    else
      v_invalid := v_invalid + 1;
    end if;
  end loop;

  return jsonb_build_object('accepted', v_accepted, 'invalid', v_invalid);
end;
$$;

revoke all on function public.content_view_ingest(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.content_view_ingest(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 5. Sponsored candidates: delivery switch, goal, pacing, fair rotation,
--    publisher eligibility, never the viewer's own promotion
-- ---------------------------------------------------------------------
create or replace function public.content_sponsored_candidates(
  p_viewer     uuid,
  p_viewer_key text,
  p_lat        double precision,
  p_lng        double precision,
  p_limit      integer
)
returns table (campaign_id uuid, post_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s  public.content_program_setting%rowtype;
  pr public.content_promotion_pricing%rowtype;
  v_point extensions.geography;
begin
  select * into s from public.content_program_setting where id = 1;
  select * into pr from public.content_promotion_pricing where id = 1;
  if not (s.spotlight_enabled and s.sponsored_delivery_enabled) then return; end if;
  if p_lat is not null and p_lng is not null then
    v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;
  return query
  with live as (
    select c.id, c.post_id, c.impression_count,
      -- Impressions the plan allows by now: an even pace over the run,
      -- times the pacing multiplier, never below 1 % of the goal.
      greatest(
        ceil(c.impression_goal * 0.01),
        ceil(c.impression_goal * least(1.0,
          extract(epoch from (now() - c.starts_at))
          / greatest(extract(epoch from (c.ends_at - c.starts_at)), 1)
          * coalesce(pr.pacing_multiplier, 2.0)))
      ) as allowed_now
    from public.content_campaign c
    join public.content_post p on p.id = c.post_id
    where c.status = 'active'
      and c.starts_at <= now() and c.ends_at > now()
      and c.impression_count < c.impression_goal
      and p.kind = 'spotlight' and p.status = 'published' and p.moderation_state = 'visible'
      and exists (select 1 from public.user_info u where u.id = p.author_id and u.status_id = 1)
      and (p.publisher_place_id is null or exists (
        select 1 from public.place pl where pl.id = p.publisher_place_id and pl.status = 'published'
          and coalesce(pl.moderation_state, 'visible') not in ('hidden', 'removed')))
      and (p_viewer is null or p.author_id <> p_viewer)
      and (c.targeting_location is null or (v_point is not null
           and extensions.st_dwithin(c.targeting_location, v_point, coalesce(c.targeting_radius_km, 25) * 1000)))
      and (cardinality(c.targeting_categories) = 0 or p.category = any (c.targeting_categories))
      and (p_viewer is null or not public.content_users_blocked(p_viewer, p.author_id))
      and (p_viewer is null or not exists (
        select 1 from public.content_not_interested n where n.user_id = p_viewer and n.post_id = p.id))
      and (
        select count(*) from public.content_view v
        where v.campaign_id = c.id and v.kind = 'impression' and v.valid
          and v.viewer_key = p_viewer_key and v.created_at > now() - interval '1 day'
      ) < s.sponsored_daily_cap_per_viewer
  )
  select l.id, l.post_id
  from live l
  where l.impression_count < l.allowed_now
  -- Fair rotation: the campaign furthest behind its plan goes first.
  order by (l.impression_count::numeric / l.allowed_now) asc, random()
  limit least(greatest(coalesce(p_limit, 3), 1), 10);
end;
$$;

revoke all on function public.content_sponsored_candidates(uuid, text, double precision, double precision, integer) from public, anon, authenticated;
grant execute on function public.content_sponsored_candidates(uuid, text, double precision, double precision, integer) to service_role;

-- ---------------------------------------------------------------------
-- 6. Money: activation checks the amount; spend follows delivery
-- ---------------------------------------------------------------------
create or replace function public.content_campaign_activate_from_checkout(
  p_checkout_id    uuid,
  p_transaction_id uuid,
  p_user_id        uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ck  public.content_campaign_checkout%rowtype;
  c   public.content_campaign%rowtype;
  v_minor bigint;
  v_tx_minor bigint;
  v_key text := 'payment:' || p_checkout_id::text;
begin
  select * into ck from public.content_campaign_checkout where id = p_checkout_id for update;
  if not found or ck.owner_id <> p_user_id then
    raise exception 'Checkout not found' using errcode = 'P0002';
  end if;
  select * into c from public.content_campaign where id = ck.campaign_id for update;

  if exists (select 1 from public.content_campaign_ledger l where l.idempotency_key = v_key) then
    return jsonb_build_object('campaign_id', c.id, 'status', c.status, 'replayed', true);
  end if;
  if ck.status <> 'pending' then
    raise exception 'Checkout is %', ck.status using errcode = '22023';
  end if;
  if c.status not in ('pending_payment', 'draft') then
    raise exception 'Campaign is %', c.status using errcode = '22023';
  end if;

  -- The campaign's budget is what was priced on the server; the checkout and
  -- the verified transaction must both agree with it.
  v_minor := c.budget_minor;
  if round(ck.total_price * 100)::bigint <> v_minor then
    raise exception 'Checkout amount does not match the campaign budget' using errcode = '22023';
  end if;
  select round(t.amount * 100)::bigint into v_tx_minor
  from public.transaction t where t.id = p_transaction_id and t.status = 'successful';
  if v_tx_minor is null or v_tx_minor <> v_minor then
    raise exception 'Payment amount does not match the campaign budget' using errcode = '22023';
  end if;

  update public.content_campaign_checkout
  set status = 'paid', completed_at = now()
  where id = p_checkout_id;

  insert into public.content_campaign_ledger (campaign_id, entry_type, amount_minor, currency, transaction_id, idempotency_key, note)
  values (c.id, 'payment', v_minor, ck.currency, p_transaction_id, v_key, 'Campaign paid');

  update public.content_campaign
  set paid_minor = paid_minor + v_minor,
      transaction_id = p_transaction_id,
      checkout_id = p_checkout_id,
      updated_at = now()
  where id = c.id;

  perform public.content_campaign_transition(c.id, 'payment_confirmed', p_user_id, 'system', 'Payment verified');
  perform public.content_campaign_transition(c.id, 'pending_review', p_user_id, 'system', 'Awaiting review');

  return jsonb_build_object('campaign_id', c.id, 'status', 'pending_review', 'replayed', false);
end;
$$;

revoke all on function public.content_campaign_activate_from_checkout(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.content_campaign_activate_from_checkout(uuid, uuid, uuid) to service_role;

-- Spend = delivered impressions × cpm ÷ 1000 (rounded down, so an
-- advertiser is never charged for a part-impression), and the whole amount
-- paid once the goal is delivered. Runs for any paid campaign that has not
-- been refunded, so impressions delivered just before a pause, cancellation
-- or completion are still recognised. One ledger entry per campaign per
-- minute at most (idempotent).
create or replace function public.content_campaign_accrue(p_campaign_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        public.content_campaign%rowtype;
  v_now    timestamptz := now();
  v_secs   bigint;
  v_target bigint;
  v_delta  bigint;
  v_key    text;
begin
  select * into c from public.content_campaign where id = p_campaign_id for update;
  if not found or c.paid_minor <= 0
     or c.status not in ('active', 'paused', 'completed', 'cancelled', 'rejected') then
    return 0;
  end if;

  v_secs := c.active_seconds;
  if c.status = 'active' then
    v_secs := v_secs + greatest(0, extract(epoch from (least(v_now, c.ends_at)
      - coalesce(c.last_accrued_at, c.activated_at, c.starts_at)))::bigint);
  end if;

  v_target := case
    when c.impression_count >= c.impression_goal then c.paid_minor
    else least(c.paid_minor, floor(c.impression_count::numeric * c.cpm_minor / 1000)::bigint)
  end;
  -- Never recognise more than is left after a refund.
  v_target := least(v_target, c.paid_minor - c.refunded_minor);
  v_delta := greatest(0, v_target - c.spent_minor);

  update public.content_campaign
  set active_seconds  = v_secs,
      last_accrued_at = case when c.status = 'active' then v_now else last_accrued_at end,
      spent_minor     = spent_minor + v_delta,
      updated_at      = case when v_delta > 0 then v_now else updated_at end
  where id = p_campaign_id;

  if v_delta > 0 then
    v_key := 'accrual:' || p_campaign_id::text || ':' || to_char(v_now, 'YYYYMMDDHH24MISS') || ':' || c.impression_count::text;
    insert into public.content_campaign_ledger (campaign_id, entry_type, amount_minor, currency, idempotency_key, note)
    values (p_campaign_id, 'accrual', v_delta, c.currency, v_key,
            format('Delivered %s of %s sponsored impressions', c.impression_count, c.impression_goal));
  end if;
  return v_delta;
end;
$$;

revoke all on function public.content_campaign_accrue(uuid) from public, anon, authenticated;
grant execute on function public.content_campaign_accrue(uuid) to service_role;

-- Refund: recognise delivery up to now first, then refund at most the
-- remainder. Otherwise identical to 20260916120200.
create or replace function public.content_campaign_record_refund(
  p_campaign_id uuid,
  p_amount_minor bigint,
  p_actor_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.content_campaign%rowtype;
  v_max bigint;
  v_key text := 'refund:' || p_campaign_id::text;
begin
  select * into c from public.content_campaign where id = p_campaign_id for update;
  if not found then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.content_campaign_ledger l where l.idempotency_key = v_key) then
    return jsonb_build_object('replayed', true, 'status', c.status);
  end if;
  perform public.content_campaign_accrue(p_campaign_id);
  v_max := public.content_campaign_refundable_minor(p_campaign_id);
  if p_amount_minor <= 0 or p_amount_minor > v_max then
    raise exception 'Refund of % exceeds the refundable % pesewas', p_amount_minor, v_max using errcode = '22023';
  end if;

  insert into public.content_campaign_ledger (campaign_id, entry_type, amount_minor, currency, transaction_id, idempotency_key, actor_id, note)
  values (p_campaign_id, 'refund', p_amount_minor, c.currency, c.transaction_id, v_key, p_actor_id, p_reason);

  update public.content_campaign
  set refunded_minor = refunded_minor + p_amount_minor, refund_requested_at = now(), updated_at = now()
  where id = p_campaign_id;

  if c.transaction_id is not null then
    update public.transaction
    set status = 'refund_pending', refund_requested_at = coalesce(refund_requested_at, now()), updated_at = now()
    where id = c.transaction_id and status = 'successful';
  end if;

  perform public.content_campaign_transition(p_campaign_id, 'refunded', p_actor_id, 'admin', p_reason);
  return jsonb_build_object('replayed', false, 'status', 'refunded', 'amount_minor', p_amount_minor);
end;
$$;

revoke all on function public.content_campaign_record_refund(uuid, bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.content_campaign_record_refund(uuid, bigint, uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- 7. The tick: start, accrue, safety pauses, budget delivered, run ended
-- ---------------------------------------------------------------------
create or replace function public.content_campaign_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_started integer := 0;
  v_completed integer := 0;
  v_paused integer := 0;
  v_accrued bigint := 0;
begin
  for r in select id from public.content_campaign where status = 'scheduled' and starts_at <= now() loop
    perform public.content_campaign_transition(r.id, 'active', null, 'system', 'Start time reached');
    v_started := v_started + 1;
  end loop;

  for r in select id from public.content_campaign where status in ('active', 'paused') loop
    v_accrued := v_accrued + public.content_campaign_accrue(r.id);
  end loop;

  -- A post or publisher that stopped being eligible pauses the campaign;
  -- only staff lift a system pause (content_campaign_transition).
  for r in
    select c.id from public.content_campaign c
    join public.content_post p on p.id = c.post_id
    where c.status = 'active'
      and (p.status <> 'published' or p.moderation_state <> 'visible'
           or not exists (select 1 from public.user_info u where u.id = p.author_id and u.status_id = 1)
           or (p.publisher_place_id is not null and not exists (
             select 1 from public.place pl where pl.id = p.publisher_place_id and pl.status = 'published'
               and coalesce(pl.moderation_state, 'visible') not in ('hidden', 'removed'))))
  loop
    perform public.content_campaign_transition(r.id, 'paused', null, 'system', 'The Spotlight is no longer live');
    v_paused := v_paused + 1;
  end loop;

  for r in select id from public.content_campaign
           where status = 'active' and impression_count >= impression_goal loop
    perform public.content_campaign_transition(r.id, 'completed', null, 'system', 'Budget delivered');
    update public.content_campaign set end_reason = 'budget_delivered' where id = r.id;
    v_completed := v_completed + 1;
  end loop;

  for r in select id from public.content_campaign where status in ('active', 'paused') and ends_at <= now() loop
    perform public.content_campaign_accrue(r.id);
    perform public.content_campaign_transition(r.id, 'completed', null, 'system', 'End time reached');
    update public.content_campaign set end_reason = 'run_ended' where id = r.id;
    v_completed := v_completed + 1;
  end loop;

  return jsonb_build_object('started', v_started, 'accrued_minor', v_accrued, 'paused', v_paused, 'completed', v_completed);
end;
$$;

revoke all on function public.content_campaign_tick() from public, anon, authenticated;
grant execute on function public.content_campaign_tick() to service_role;

-- ---------------------------------------------------------------------
-- 8. Delivery metrics, kept apart: reach ≠ impressions ≠ views
-- ---------------------------------------------------------------------
create or replace function public.content_campaign_metrics(p_campaign_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'impressionGoal', c.impression_goal,
    'impressions', c.impression_count,
    'reach', c.reach_count,
    'meaningfulViews', c.view_count,
    'completions', c.completion_count,
    'deliveryBps', case when c.impression_goal > 0
                     then least(10000, (c.impression_count * 10000 / c.impression_goal))::integer else 0 end,
    'estimatedReachLow', c.estimated_reach_low,
    'estimatedReachHigh', c.estimated_reach_high,
    'clicks', jsonb_build_object(
      'profile', (select count(*) from public.content_click k where k.campaign_id = c.id and k.valid and k.kind = 'profile'),
      'event', (select count(*) from public.content_click k where k.campaign_id = c.id and k.valid and k.kind in ('event', 'ticket')),
      'place', (select count(*) from public.content_click k where k.campaign_id = c.id and k.valid and k.kind = 'place'),
      'cta', (select count(*) from public.content_click k where k.campaign_id = c.id and k.valid and k.kind = 'cta')
    ),
    -- A follow of the publisher by a signed-in person within 7 days after
    -- they were shown this promotion.
    'follows', (
      select count(distinct f.id)
      from public.follow f
      join public.content_view v
        on v.viewer_id = f.follower_id and v.campaign_id = c.id and v.kind = 'impression' and v.valid
       and f.created_at between v.created_at and v.created_at + interval '7 days'
      where (p.publisher_kind = 'place' and f.target_kind = 'place' and f.target_id = p.publisher_place_id)
         or (p.publisher_kind <> 'place' and f.target_kind = 'organizer' and f.target_id = p.author_id)
    ),
    'conversions', jsonb_build_object(
      'ticketPurchases', (select count(*) from public.content_campaign_conversion cv where cv.campaign_id = c.id and cv.kind = 'ticket_purchase'),
      'reservations', (select count(*) from public.content_campaign_conversion cv where cv.campaign_id = c.id and cv.kind = 'reservation')
    )
  )
  from public.content_campaign c
  join public.content_post p on p.id = c.post_id
  where c.id = p_campaign_id
$$;

revoke all on function public.content_campaign_metrics(uuid) from public, anon, authenticated;
grant execute on function public.content_campaign_metrics(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 9. Reconciliation: also flag delivered-short budgets left unrefunded
-- ---------------------------------------------------------------------
create or replace function public.content_campaign_reconcile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ledger_drift integer;
  v_live_unpaid integer;
  v_paid_no_transaction integer;
  v_overspent integer;
  v_unspent_stale integer;
begin
  select count(*) into v_ledger_drift
  from public.content_campaign c
  where c.paid_minor <> coalesce((select sum(l.amount_minor) from public.content_campaign_ledger l where l.campaign_id = c.id and l.entry_type = 'payment'), 0)
     or c.spent_minor <> coalesce((select sum(l.amount_minor) from public.content_campaign_ledger l where l.campaign_id = c.id and l.entry_type in ('accrual', 'adjustment')), 0)
     or c.refunded_minor <> coalesce((select sum(l.amount_minor) from public.content_campaign_ledger l where l.campaign_id = c.id and l.entry_type = 'refund'), 0);
  if v_ledger_drift > 0 then
    perform public.open_reconciliation_incident(
      'content_campaign.ledger_drift', 'Campaign money columns disagree with the ledger',
      format('%s content_campaign row(s) have paid/spent/refunded that do not equal their content_campaign_ledger sums.', v_ledger_drift),
      'critical');
  end if;

  select count(*) into v_live_unpaid
  from public.content_campaign c
  where c.status in ('scheduled', 'active', 'paused', 'completed') and (c.paid_minor <= 0 or c.transaction_id is null);
  if v_live_unpaid > 0 then
    perform public.open_reconciliation_incident(
      'content_campaign.live_unpaid', 'Campaign live without a verified payment',
      format('%s campaign(s) are scheduled/active/paused/completed with no paid amount or transaction.', v_live_unpaid),
      'critical');
  end if;

  select count(*) into v_paid_no_transaction
  from public.content_campaign c
  where c.transaction_id is not null
    and not exists (select 1 from public.transaction t where t.id = c.transaction_id and t.status in ('successful', 'refund_pending', 'refunded'));
  if v_paid_no_transaction > 0 then
    perform public.open_reconciliation_incident(
      'content_campaign.transaction_missing', 'Campaign points at a missing or failed transaction',
      format('%s campaign(s) reference a transaction that is missing or not successful.', v_paid_no_transaction),
      'critical');
  end if;

  -- Spend recognised beyond what delivery justifies.
  select count(*) into v_overspent
  from public.content_campaign c
  where c.paid_minor > 0
    and c.spent_minor > case when c.impression_count >= c.impression_goal then c.paid_minor
                             else floor(c.impression_count::numeric * c.cpm_minor / 1000)::bigint end;
  if v_overspent > 0 then
    perform public.open_reconciliation_incident(
      'content_campaign.overspent', 'Campaign spend exceeds delivered impressions',
      format('%s campaign(s) recognised more spend than their delivered impressions × cost per 1,000.', v_overspent),
      'critical');
  end if;

  -- A promotion that ended before delivering its budget, with the unused
  -- part still unrefunded a week later.
  select count(*) into v_unspent_stale
  from public.content_campaign c
  where c.status = 'completed'
    and c.paid_minor - c.spent_minor - c.refunded_minor > 0
    and c.completed_at < now() - interval '7 days';
  if v_unspent_stale > 0 then
    perform public.open_reconciliation_incident(
      'content_campaign.unspent_unrefunded', 'Unused promotion budget waiting for a decision',
      format('%s completed campaign(s) ended more than 7 days ago with unused budget that has not been refunded.', v_unspent_stale),
      'medium');
  end if;

  return jsonb_build_object('ledger_drift', v_ledger_drift, 'live_unpaid', v_live_unpaid,
    'transaction_missing', v_paid_no_transaction, 'overspent', v_overspent, 'unspent_unrefunded', v_unspent_stale);
end;
$$;

revoke all on function public.content_campaign_reconcile() from public, anon, authenticated;
grant execute on function public.content_campaign_reconcile() to service_role;

-- ---------------------------------------------------------------------
-- 10. Admin overview: add reach
-- ---------------------------------------------------------------------
create or replace function public.content_admin_overview(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'spotlight', jsonb_build_object(
      'posts', (select count(*) from public.content_post p where p.kind = 'spotlight' and p.published_at between p_from and p_to),
      'activeCreators', (select count(distinct p.author_id) from public.content_post p where p.kind = 'spotlight' and p.published_at between p_from and p_to),
      'livePosts', (select count(*) from public.content_post p where p.kind = 'spotlight' and p.status = 'published' and p.moderation_state = 'visible'),
      'impressions', (select coalesce(sum(d.impressions), 0) from public.content_post_daily_stat d join public.content_post p on p.id = d.post_id where p.kind = 'spotlight' and d.day between p_from::date and p_to::date),
      'meaningfulViews', (select coalesce(sum(d.meaningful_views), 0) from public.content_post_daily_stat d join public.content_post p on p.id = d.post_id where p.kind = 'spotlight' and d.day between p_from::date and p_to::date),
      'completions', (select coalesce(sum(d.completions), 0) from public.content_post_daily_stat d join public.content_post p on p.id = d.post_id where p.kind = 'spotlight' and d.day between p_from::date and p_to::date),
      'likes', (select count(*) from public.content_like l join public.content_post p on p.id = l.post_id where p.kind = 'spotlight' and l.created_at between p_from and p_to),
      'comments', (select count(*) from public.content_comment c join public.content_post p on p.id = c.post_id where p.kind = 'spotlight' and c.created_at between p_from and p_to),
      'shares', (select count(*) from public.content_share s join public.content_post p on p.id = s.post_id where p.kind = 'spotlight' and s.created_at between p_from and p_to),
      'saves', (select count(*) from public.content_save s join public.content_post p on p.id = s.post_id where p.kind = 'spotlight' and s.created_at between p_from and p_to),
      'eventClicks', (select coalesce(sum(d.event_clicks + d.ticket_clicks), 0) from public.content_post_daily_stat d join public.content_post p on p.id = d.post_id where p.kind = 'spotlight' and d.day between p_from::date and p_to::date),
      'placeClicks', (select coalesce(sum(d.place_clicks), 0) from public.content_post_daily_stat d join public.content_post p on p.id = d.post_id where p.kind = 'spotlight' and d.day between p_from::date and p_to::date),
      'profileClicks', (select coalesce(sum(d.profile_clicks), 0) from public.content_post_daily_stat d join public.content_post p on p.id = d.post_id where p.kind = 'spotlight' and d.day between p_from::date and p_to::date),
      'conversions', (select count(*) from public.content_campaign_conversion cv where cv.created_at between p_from and p_to)
    ),
    'stories', jsonb_build_object(
      'posts', (select count(*) from public.content_post p where p.kind = 'story' and p.published_at between p_from and p_to),
      'activePublishers', (select count(distinct coalesce(p.publisher_place_id, p.author_id)) from public.content_post p where p.kind = 'story' and p.published_at between p_from and p_to),
      'live', (select count(*) from public.content_post p where p.kind = 'story' and public.content_post_is_public(p.status, p.moderation_state, p.kind, p.published_at, p.expires_at)),
      'viewStarts', (select coalesce(sum(d.view_starts), 0) from public.content_post_daily_stat d join public.content_post p on p.id = d.post_id where p.kind = 'story' and d.day between p_from::date and p_to::date),
      'completions', (select coalesce(sum(d.completions), 0) from public.content_post_daily_stat d join public.content_post p on p.id = d.post_id where p.kind = 'story' and d.day between p_from::date and p_to::date),
      'reactions', (select count(*) from public.content_reaction r join public.content_post p on p.id = r.post_id where p.kind = 'story' and r.created_at between p_from and p_to),
      'comments', (select count(*) from public.content_comment c join public.content_post p on p.id = c.post_id where p.kind = 'story' and c.created_at between p_from and p_to)
    ),
    'social', jsonb_build_object(
      'follows', (select count(*) from public.follow f where f.created_at between p_from and p_to),
      'totalFollows', (select count(*) from public.follow),
      'reportsOpen', (select count(*) from public.report r where r.target_type in ('spotlight', 'story', 'content_comment') and r.status in ('new', 'under_review', 'awaiting_info', 'escalated')),
      'moderated', (select count(*) from public.content_post p where p.moderation_state <> 'visible')
    ),
    'campaigns', jsonb_build_object(
      'created', (select count(*) from public.content_campaign c where c.created_at between p_from and p_to),
      'advertisers', (select count(distinct c.advertiser_id) from public.content_campaign c where c.paid_minor > 0 and c.created_at between p_from and p_to),
      'pendingReview', (select count(*) from public.content_campaign c where c.status = 'pending_review'),
      'active', (select count(*) from public.content_campaign c where c.status = 'active'),
      'paidMinor', (select coalesce(sum(l.amount_minor), 0) from public.content_campaign_ledger l where l.entry_type = 'payment' and l.created_at between p_from and p_to),
      'spentMinor', (select coalesce(sum(l.amount_minor), 0) from public.content_campaign_ledger l where l.entry_type = 'accrual' and l.created_at between p_from and p_to),
      'refundedMinor', (select coalesce(sum(l.amount_minor), 0) from public.content_campaign_ledger l where l.entry_type = 'refund' and l.created_at between p_from and p_to),
      'impressions', (select coalesce(sum(c.impression_count), 0) from public.content_campaign c where c.created_at between p_from and p_to),
      'reach', (select coalesce(sum(c.reach_count), 0) from public.content_campaign c where c.created_at between p_from and p_to),
      'clicks', (select coalesce(sum(c.click_count), 0) from public.content_campaign c where c.created_at between p_from and p_to),
      'conversions', (select coalesce(sum(c.conversion_count), 0) from public.content_campaign c where c.created_at between p_from and p_to),
      'unusedToReviewMinor', (select coalesce(sum(c.paid_minor - c.spent_minor - c.refunded_minor), 0) from public.content_campaign c where c.status in ('completed', 'cancelled'))
    )
  )
$$;

revoke all on function public.content_admin_overview(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.content_admin_overview(timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 11. Privileges and jobs
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['content_promotion_pricing', 'content_audience_snapshot'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end;
$$;

select cron.unschedule(j.jobname) from cron.job j where j.jobname = 'content-audience-refresh';
select cron.schedule('content-audience-refresh', '15 3 * * *', $$select public.content_audience_refresh();$$);

select public.content_audience_refresh();
