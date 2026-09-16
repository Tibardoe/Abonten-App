-- Spotlight + Stories content platform — part 3 of 3: promoted Spotlight
-- campaigns, their money path, conversions, admin analytics and jobs.
--
-- Billing model (version 1): a FIXED campaign. The advertiser picks a
-- preset (budget for a number of days), pays it in full through the existing
-- Paystack path (payment_attempt -> finalizePaystackPayment -> a verified
-- `transaction` row -> the injected activateContentCampaign step), staff
-- review it, and it runs from starts_at to ends_at. Spend accrues per hour
-- while the campaign is active, into an append-only ledger; the unspent
-- remainder is what an admin may refund. Impressions, views, clicks and
-- attributed conversions are reported, never billed. No auction, no
-- per-impression billing, no credit tender (cash only) — the simplest model
-- that can be measured and reconciled.
--
-- Campaign money is platform revenue: it never touches
-- organizer_ledger_entry. `transaction.reason` stays 'Promotion_Purchase'
-- (the same value featuring uses); the payment_attempt target column tells
-- the two apart.

-- ---------------------------------------------------------------------
-- 1. Presets (editable like promotion tiers)
-- ---------------------------------------------------------------------
create table public.content_campaign_preset (
  id                    smallint    primary key,
  label                 text        not null,
  budget_minor          bigint      not null check (budget_minor > 0),
  currency              text        not null default 'GHS',
  duration_days         smallint    not null check (duration_days between 1 and 60),
  estimated_impressions integer     not null default 0 check (estimated_impressions >= 0),
  is_active             boolean     not null default true,
  position              smallint    not null default 0
);

comment on table public.content_campaign_preset is
  'Promoted Spotlight presets: a fixed budget for a fixed number of days. estimated_impressions is guidance shown to the advertiser, never a promise.';

insert into public.content_campaign_preset (id, label, budget_minor, duration_days, estimated_impressions, position) values
  (1, '3 days',  5000,  3,  1500, 1),
  (2, '5 days',  10000, 5,  3500, 2),
  (3, '1 week',  25000, 7,  9000, 3),
  (4, '2 weeks', 50000, 14, 20000, 4)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Campaigns, checkouts, ledger, events, conversions
-- ---------------------------------------------------------------------
create table public.content_campaign (
  id                    uuid        primary key default gen_random_uuid(),
  post_id               uuid        not null references public.content_post (id) on delete restrict,
  advertiser_id         uuid        not null references public.user_info (id) on delete restrict,
  objective             text        not null default 'views'
                          check (objective in ('views', 'profile_visits', 'event_views', 'place_views', 'ticket_sales', 'reservations')),
  preset_id             smallint    not null references public.content_campaign_preset (id),
  budget_minor          bigint      not null check (budget_minor > 0),
  currency              text        not null default 'GHS',
  duration_days         smallint    not null check (duration_days between 1 and 60),
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  status                text        not null default 'draft'
                          check (status in ('draft', 'pending_payment', 'payment_confirmed', 'pending_review',
                                            'scheduled', 'active', 'paused', 'completed', 'rejected',
                                            'cancelled', 'refunded')),
  targeting_location    extensions.geography(Point, 4326),
  targeting_radius_km   numeric     check (targeting_radius_km is null or targeting_radius_km between 1 and 500),
  targeting_categories  text[]      not null default '{}',
  paid_minor            bigint      not null default 0 check (paid_minor >= 0),
  spent_minor           bigint      not null default 0 check (spent_minor >= 0),
  refunded_minor        bigint      not null default 0 check (refunded_minor >= 0),
  active_seconds        bigint      not null default 0 check (active_seconds >= 0),
  checkout_id           uuid,
  transaction_id        uuid,
  review_reason         text,
  reviewed_by           uuid,
  reviewed_at           timestamptz,
  pause_reason          text,
  pause_source          text        check (pause_source is null or pause_source in ('advertiser', 'admin', 'system')),
  impression_count      integer     not null default 0,
  view_count            integer     not null default 0,
  click_count           integer     not null default 0,
  conversion_count      integer     not null default 0,
  last_accrued_at       timestamptz,
  activated_at          timestamptz,
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  refund_requested_at   timestamptz,
  version               integer     not null default 1,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint content_campaign_dates_check check (ends_at > starts_at),
  constraint content_campaign_money_check check (spent_minor + refunded_minor <= paid_minor or paid_minor = 0)
);

comment on table public.content_campaign is
  'A promoted Spotlight campaign. Only content_campaign_transition() and the money functions below change status or money columns.';

create index idx_content_campaign_status on public.content_campaign (status, starts_at, ends_at);
create index idx_content_campaign_advertiser on public.content_campaign (advertiser_id, created_at desc);
create index idx_content_campaign_post on public.content_campaign (post_id);
create index idx_content_campaign_review on public.content_campaign (created_at desc) where status = 'pending_review';
create index idx_content_campaign_targeting on public.content_campaign using gist (targeting_location)
  where status = 'active';

create table public.content_campaign_checkout (
  id           uuid        primary key default gen_random_uuid(),
  campaign_id  uuid        not null references public.content_campaign (id) on delete cascade,
  owner_id     uuid        not null references public.user_info (id) on delete cascade,
  preset_id    smallint    not null references public.content_campaign_preset (id),
  unit_price   numeric     not null check (unit_price >= 0),
  total_price  numeric     not null check (total_price >= 0),
  currency     text        not null default 'GHS',
  status       text        not null default 'pending'
                 check (status in ('pending', 'paid', 'expired', 'cancelled')),
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

comment on table public.content_campaign_checkout is
  'Money-path checkout for a campaign (mirrors event_promotion_checkout): priced from the preset on the server, 30-minute hold, paid only by finalizePaystackPayment.';

create index idx_content_campaign_checkout_owner on public.content_campaign_checkout (owner_id, created_at desc);
create index idx_content_campaign_checkout_campaign on public.content_campaign_checkout (campaign_id);
create index idx_content_campaign_checkout_pending on public.content_campaign_checkout (expires_at) where status = 'pending';

alter table public.content_campaign
  add constraint content_campaign_checkout_fkey
  foreign key (checkout_id) references public.content_campaign_checkout (id) on delete set null
  deferrable initially deferred;

create table public.content_campaign_ledger (
  id              bigint      generated always as identity primary key,
  campaign_id     uuid        not null references public.content_campaign (id) on delete restrict,
  entry_type      text        not null check (entry_type in ('payment', 'accrual', 'refund', 'adjustment')),
  amount_minor    bigint      not null,
  currency        text        not null default 'GHS',
  transaction_id  uuid,
  note            text,
  idempotency_key text        not null unique,
  actor_id        uuid,
  created_at      timestamptz not null default now()
);

comment on table public.content_campaign_ledger is
  'Append-only campaign money ledger in pesewas: payment (+paid), accrual (spend recognised while active), refund (returned), adjustment (admin, audited). paid/spent/refunded on the campaign are caches of its sums.';

create index idx_content_campaign_ledger_campaign on public.content_campaign_ledger (campaign_id, created_at);

create or replace function public._content_campaign_ledger_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'content_campaign_ledger is append-only' using errcode = '42501';
end;
$$;

create trigger trg_content_campaign_ledger_append_only
  before update or delete on public.content_campaign_ledger
  for each row execute function public._content_campaign_ledger_guard();

create table public.content_campaign_event (
  id          bigint      generated always as identity primary key,
  campaign_id uuid        not null references public.content_campaign (id) on delete cascade,
  actor_id    uuid,
  actor_kind  text        not null check (actor_kind in ('advertiser', 'admin', 'system')),
  from_status text,
  to_status   text        not null,
  reason      text,
  created_at  timestamptz not null default now()
);
create index idx_content_campaign_event_campaign on public.content_campaign_event (campaign_id, created_at);

create table public.content_campaign_conversion (
  id          bigint      generated always as identity primary key,
  post_id     uuid        not null references public.content_post (id) on delete cascade,
  campaign_id uuid        references public.content_campaign (id) on delete set null,
  user_id     uuid,
  kind        text        not null check (kind in ('ticket_purchase', 'reservation')),
  source_id   uuid        not null,
  click_id    bigint,
  created_at  timestamptz not null default now(),
  unique (kind, source_id)
);

comment on table public.content_campaign_conversion is
  'A conversion = a paid ticket checkout for the attached event, or an accepted booking at the attached place, by a person who clicked the post within the previous 7 days. Attributed hourly by content_attribute_conversions().';

create index idx_content_campaign_conversion_post on public.content_campaign_conversion (post_id, created_at desc);
create index idx_content_campaign_conversion_campaign on public.content_campaign_conversion (campaign_id)
  where campaign_id is not null;

-- Owner insights (moved here because it reads conversions).
create or replace function public.content_post_insights(p_post_id uuid, p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select d from public.content_post_daily_stat d
    where d.post_id = p_post_id
      and d.day >= (now() at time zone 'utc')::date - least(greatest(p_days, 1), 365)
  )
  select jsonb_build_object(
    'totals', (select jsonb_build_object(
      'impressions', coalesce(sum((d).impressions), 0),
      'viewStarts', coalesce(sum((d).view_starts), 0),
      'meaningfulViews', coalesce(sum((d).meaningful_views), 0),
      'completions', coalesce(sum((d).completions), 0),
      'replays', coalesce(sum((d).replays), 0),
      'uniqueViewers', coalesce(sum((d).unique_viewers), 0),
      'watchedMsTotal', coalesce(sum((d).watched_ms_total), 0),
      'likes', coalesce(sum((d).likes), 0),
      'comments', coalesce(sum((d).comments), 0),
      'shares', coalesce(sum((d).shares), 0),
      'saves', coalesce(sum((d).saves), 0),
      'profileClicks', coalesce(sum((d).profile_clicks), 0),
      'eventClicks', coalesce(sum((d).event_clicks), 0),
      'placeClicks', coalesce(sum((d).place_clicks), 0),
      'ticketClicks', coalesce(sum((d).ticket_clicks), 0),
      'ctaClicks', coalesce(sum((d).cta_clicks), 0)
    ) from days),
    'series', coalesce((select jsonb_agg(jsonb_build_object(
      'day', (d).day, 'impressions', (d).impressions, 'meaningfulViews', (d).meaningful_views,
      'completions', (d).completions, 'likes', (d).likes, 'comments', (d).comments,
      'shares', (d).shares, 'saves', (d).saves,
      'clicks', (d).profile_clicks + (d).event_clicks + (d).place_clicks + (d).ticket_clicks + (d).cta_clicks
    ) order by (d).day) from days), '[]'::jsonb),
    'conversions', (select jsonb_build_object(
      'ticketPurchases', count(*) filter (where cv.kind = 'ticket_purchase'),
      'reservations', count(*) filter (where cv.kind = 'reservation'))
      from public.content_campaign_conversion cv where cv.post_id = p_post_id)
  )
$$;

revoke all on function public.content_post_insights(uuid, integer) from public, anon, authenticated;
grant execute on function public.content_post_insights(uuid, integer) to service_role;

-- ---------------------------------------------------------------------
-- 3. Payment plumbing: fifth payment_attempt target, credit target type
-- ---------------------------------------------------------------------
alter table public.payment_attempt
  add column if not exists content_campaign_checkout_id uuid
    references public.content_campaign_checkout (id) on delete restrict;

create index if not exists idx_payment_attempt_content_campaign_checkout
  on public.payment_attempt (content_campaign_checkout_id)
  where content_campaign_checkout_id is not null;

alter table public.payment_attempt drop constraint if exists payment_attempt_target_check;
alter table public.payment_attempt add constraint payment_attempt_target_check check (
  ((checkout_session_id is not null)::integer
   + (subscription_checkout_id is not null)::integer
   + (place_promotion_checkout_id is not null)::integer
   + (event_promotion_checkout_id is not null)::integer
   + (content_campaign_checkout_id is not null)::integer) = 1
);

-- Credit tender is not offered for campaigns in version 1; the target type
-- is widened so a future decision needs no constraint change.
alter table public.credit_reservation drop constraint if exists credit_reservation_target_type_check;
alter table public.credit_reservation add constraint credit_reservation_target_type_check check (
  target_type in ('event_promotion_checkout', 'place_promotion_checkout', 'ticket_payment_group', 'content_campaign_checkout')
);

-- Same sweep the promotion checkouts have: a pending checkout past its hold
-- expires unless a payment is in flight; its campaign goes back to draft so
-- the advertiser can try again.
create or replace function public.expire_stale_content_campaign_checkouts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  with expired as (
    update public.content_campaign_checkout c
    set status = 'expired'
    where c.status = 'pending'
      and c.expires_at is not null
      and c.expires_at < now()
      and not exists (
        select 1 from public.payment_attempt pa
        where pa.content_campaign_checkout_id = c.id
          and pa.status in ('initiated', 'pending', 'processing', 'fulfillment_failed')
      )
    returning c.campaign_id
  )
  update public.content_campaign cc
  set status = 'draft', checkout_id = null, updated_at = now(), version = version + 1
  from expired e
  where cc.id = e.campaign_id and cc.status = 'pending_payment';
end;
$$;

revoke all on function public.expire_stale_content_campaign_checkouts() from public, anon, authenticated;
grant execute on function public.expire_stale_content_campaign_checkouts() to service_role;

-- ---------------------------------------------------------------------
-- 4. The state machine
-- ---------------------------------------------------------------------
-- The ONLY thing that moves a campaign between states. Money columns are
-- moved by the functions in §5, which call this for the status part.
create or replace function public.content_campaign_transition(
  p_campaign_id uuid,
  p_to          text,
  p_actor_id    uuid,
  p_actor_kind  text,
  p_reason      text default null
)
returns public.content_campaign
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        public.content_campaign%rowtype;
  v_from   text;
  v_allowed boolean;
  v_post_ok boolean;
begin
  if p_actor_kind not in ('advertiser', 'admin', 'system') then
    raise exception 'Bad actor kind' using errcode = '22023';
  end if;

  select * into c from public.content_campaign where id = p_campaign_id for update;
  if not found then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;
  v_from := c.status;
  if v_from = p_to then
    return c;
  end if;

  -- Who may do what.
  v_allowed := case
    when p_to = 'pending_payment'   then v_from = 'draft' and p_actor_kind in ('advertiser', 'system')
    when p_to = 'draft'             then v_from = 'pending_payment' and p_actor_kind = 'system'
    when p_to = 'payment_confirmed' then v_from in ('pending_payment', 'draft') and p_actor_kind = 'system'
    when p_to = 'pending_review'    then v_from = 'payment_confirmed' and p_actor_kind = 'system'
    when p_to = 'scheduled'         then v_from = 'pending_review' and p_actor_kind = 'admin'
    when p_to = 'active'            then (v_from = 'pending_review' and p_actor_kind = 'admin')
                                       or (v_from = 'scheduled' and p_actor_kind = 'system')
                                       or (v_from = 'paused' and p_actor_kind in ('advertiser', 'admin', 'system'))
    when p_to = 'paused'            then v_from = 'active' and p_actor_kind in ('advertiser', 'admin', 'system')
    when p_to = 'completed'         then v_from in ('active', 'paused') and p_actor_kind = 'system'
    when p_to = 'rejected'          then v_from = 'pending_review' and p_actor_kind = 'admin'
    when p_to = 'cancelled'         then (v_from in ('draft', 'pending_payment') and p_actor_kind in ('advertiser', 'admin', 'system'))
                                       or (v_from in ('pending_review', 'scheduled', 'active', 'paused') and p_actor_kind in ('advertiser', 'admin'))
    when p_to = 'refunded'          then v_from in ('rejected', 'cancelled', 'completed') and p_actor_kind in ('admin', 'system')
    else false
  end;
  if not v_allowed then
    raise exception 'Cannot move a % campaign to % as %', v_from, p_to, p_actor_kind using errcode = '22023';
  end if;

  if p_to in ('rejected', 'cancelled', 'paused') and p_actor_kind = 'admin'
     and (p_reason is null or length(trim(p_reason)) < 3) then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  -- Going live needs a verified payment and a visible post.
  if p_to in ('scheduled', 'active') and v_from in ('pending_review', 'scheduled') then
    if c.paid_minor <= 0 or c.transaction_id is null then
      raise exception 'Campaign is not paid' using errcode = '22023';
    end if;
    select p.status = 'published' and p.moderation_state = 'visible' into v_post_ok
    from public.content_post p where p.id = c.post_id;
    if not coalesce(v_post_ok, false) then
      raise exception 'The Spotlight is not live' using errcode = '22023';
    end if;
  end if;

  -- Approving after the chosen start has passed: start now, keep the
  -- duration.
  if p_to = 'active' and v_from = 'pending_review' then
    if c.starts_at > now() then
      -- Not yet due: the admin asked for "active" but it is a schedule.
      p_to := 'scheduled';
    else
      c.starts_at := now();
      c.ends_at := now() + make_interval(days => c.duration_days);
    end if;
  elsif p_to = 'scheduled' and v_from = 'pending_review' and c.starts_at <= now() then
    c.starts_at := now();
    c.ends_at := now() + make_interval(days => c.duration_days);
    p_to := 'active';
  end if;

  update public.content_campaign
  set status          = p_to,
      starts_at       = c.starts_at,
      ends_at         = c.ends_at,
      reviewed_by     = case when p_actor_kind = 'admin' and v_from = 'pending_review' then p_actor_id else reviewed_by end,
      reviewed_at     = case when p_actor_kind = 'admin' and v_from = 'pending_review' then now() else reviewed_at end,
      review_reason   = case when p_to = 'rejected' then p_reason else review_reason end,
      pause_reason    = case when p_to = 'paused' then p_reason when p_to = 'active' then null else pause_reason end,
      pause_source    = case when p_to = 'paused' then p_actor_kind when p_to = 'active' then null else pause_source end,
      activated_at    = case when p_to = 'active' and activated_at is null then now() else activated_at end,
      last_accrued_at = case when p_to = 'active' then now() when p_to = 'paused' then null else last_accrued_at end,
      completed_at    = case when p_to = 'completed' then now() else completed_at end,
      cancelled_at    = case when p_to = 'cancelled' then now() else cancelled_at end,
      updated_at      = now(),
      version         = version + 1
  where id = p_campaign_id
  returning * into c;

  insert into public.content_campaign_event (campaign_id, actor_id, actor_kind, from_status, to_status, reason)
  values (p_campaign_id, p_actor_id, p_actor_kind, v_from, p_to, p_reason);

  return c;
end;
$$;

revoke all on function public.content_campaign_transition(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.content_campaign_transition(uuid, text, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------
-- 5. Money: activation from a verified payment, accrual, refunds
-- ---------------------------------------------------------------------
-- Called by the fulfilment step (activateContentCampaign) once
-- finalizePaystackPayment has a `transaction` row for this checkout. The
-- caller has already checked ownership and the payment proof; this function
-- makes the change exactly once (ledger idempotency key = the checkout).
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

  v_minor := round(ck.total_price * 100)::bigint;

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

-- Accrual: spend recognised for the seconds a campaign was active since the
-- last tick. spent = paid × active_seconds / duration_seconds, capped at
-- paid. One ledger entry per campaign per tick hour (idempotent).
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
  if not found or c.status <> 'active' then return 0; end if;

  v_secs := c.active_seconds + greatest(0, extract(epoch from (least(v_now, c.ends_at) - coalesce(c.last_accrued_at, c.activated_at, c.starts_at)))::bigint);
  v_target := least(c.paid_minor, round(c.paid_minor * v_secs::numeric / (c.duration_days * 86400))::bigint);
  v_delta := greatest(0, v_target - c.spent_minor);

  update public.content_campaign
  set active_seconds = v_secs, last_accrued_at = v_now, spent_minor = spent_minor + v_delta, updated_at = v_now
  where id = p_campaign_id;

  if v_delta > 0 then
    v_key := 'accrual:' || p_campaign_id::text || ':' || to_char(v_now, 'YYYYMMDDHH24MI');
    insert into public.content_campaign_ledger (campaign_id, entry_type, amount_minor, currency, idempotency_key, note)
    values (p_campaign_id, 'accrual', v_delta, c.currency, v_key, 'Spend accrued')
    on conflict (idempotency_key) do nothing;
  end if;
  return v_delta;
end;
$$;

revoke all on function public.content_campaign_accrue(uuid) from public, anon, authenticated;
grant execute on function public.content_campaign_accrue(uuid) to service_role;

-- What an admin may refund: paid − spent − refunded. Zero unless the
-- campaign is rejected, cancelled or completed.
create or replace function public.content_campaign_refundable_minor(p_campaign_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.status in ('rejected', 'cancelled', 'completed')
              then greatest(0, c.paid_minor - c.spent_minor - c.refunded_minor) else 0 end
  from public.content_campaign c where c.id = p_campaign_id
$$;

revoke all on function public.content_campaign_refundable_minor(uuid) from public, anon, authenticated;
grant execute on function public.content_campaign_refundable_minor(uuid) to service_role;

-- Records a refund the service has just requested from Paystack. Exactly
-- once per campaign (idempotency key), amount bounded by the refundable
-- remainder, transaction moved to refund_pending (the existing Paystack
-- webhook flips it to refunded / back to successful).
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
-- 6. The tick: schedule -> active, accrual, completion, safety pauses
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
  -- Scheduled campaigns whose time has come.
  for r in select id from public.content_campaign where status = 'scheduled' and starts_at <= now() loop
    perform public.content_campaign_transition(r.id, 'active', null, 'system', 'Start time reached');
    v_started := v_started + 1;
  end loop;

  -- Accrue spend on everything active.
  for r in select id from public.content_campaign where status = 'active' loop
    v_accrued := v_accrued + public.content_campaign_accrue(r.id);
  end loop;

  -- A post that stopped being visible (moderated, deleted, author
  -- restricted) pauses its campaign; the advertiser or an admin resumes it
  -- once the post is live again.
  for r in
    select c.id from public.content_campaign c
    join public.content_post p on p.id = c.post_id
    where c.status = 'active'
      and (p.status <> 'published' or p.moderation_state <> 'visible'
           or not exists (select 1 from public.user_info u where u.id = p.author_id and u.status_id = 1))
  loop
    perform public.content_campaign_transition(r.id, 'paused', null, 'system', 'The Spotlight is no longer live');
    v_paused := v_paused + 1;
  end loop;

  -- Finished campaigns.
  for r in select id from public.content_campaign where status in ('active', 'paused') and ends_at <= now() loop
    perform public.content_campaign_transition(r.id, 'completed', null, 'system', 'End time reached');
    v_completed := v_completed + 1;
  end loop;

  return jsonb_build_object('started', v_started, 'accrued_minor', v_accrued, 'paused', v_paused, 'completed', v_completed);
end;
$$;

revoke all on function public.content_campaign_tick() from public, anon, authenticated;
grant execute on function public.content_campaign_tick() to service_role;

-- ---------------------------------------------------------------------
-- 7. Conversions
-- ---------------------------------------------------------------------
create or replace function public.content_attribute_conversions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
  v_m integer := 0;
begin
  -- Paid ticket checkouts for an attached event, preceded (within 7 days)
  -- by a click on the post by the same person.
  insert into public.content_campaign_conversion (post_id, campaign_id, user_id, kind, source_id, click_id)
  select distinct on (tc.id) p.id, k.campaign_id, tc.user_id, 'ticket_purchase', tc.id, k.id
  from public.ticket_checkout tc
  join public.content_post p on p.event_id = tc.event_id
  join public.content_click k on k.post_id = p.id and k.viewer_id = tc.user_id and k.valid
    and k.kind in ('event', 'ticket', 'cta')
    and k.created_at between (tc.updated_at at time zone 'utc') - interval '7 days' and (tc.updated_at at time zone 'utc')
  where tc.status = 'paid' and tc.user_id is not null
    and tc.updated_at > (now() at time zone 'utc') - interval '3 hours'
  order by tc.id, k.created_at desc
  on conflict (kind, source_id) do nothing;
  get diagnostics v_n = row_count;

  -- Accepted bookings at an attached place.
  insert into public.content_campaign_conversion (post_id, campaign_id, user_id, kind, source_id, click_id)
  select distinct on (b.id) p.id, k.campaign_id, b.customer_id, 'reservation', b.id, k.id
  from public.place_booking b
  join public.content_post p on p.place_id = b.place_id
  join public.content_click k on k.post_id = p.id and k.viewer_id = b.customer_id and k.valid
    and k.kind in ('place', 'cta')
    and k.created_at between b.updated_at - interval '7 days' and b.updated_at
  where b.status = 'accepted' and b.updated_at > now() - interval '3 hours'
  order by b.id, k.created_at desc
  on conflict (kind, source_id) do nothing;
  get diagnostics v_m = row_count;

  update public.content_campaign c
  set conversion_count = (select count(*) from public.content_campaign_conversion cv where cv.campaign_id = c.id)
  where c.id in (select campaign_id from public.content_campaign_conversion where campaign_id is not null
                 and created_at > now() - interval '1 hour');

  return v_n + v_m;
end;
$$;

revoke all on function public.content_attribute_conversions() from public, anon, authenticated;
grant execute on function public.content_attribute_conversions() to service_role;

-- ---------------------------------------------------------------------
-- 8. Reconciliation (campaign invariants -> incidents)
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

  return jsonb_build_object('ledger_drift', v_ledger_drift, 'live_unpaid', v_live_unpaid, 'transaction_missing', v_paid_no_transaction);
end;
$$;

revoke all on function public.content_campaign_reconcile() from public, anon, authenticated;
grant execute on function public.content_campaign_reconcile() to service_role;

-- ---------------------------------------------------------------------
-- 9. Admin overview
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
      'clicks', (select coalesce(sum(c.click_count), 0) from public.content_campaign c where c.created_at between p_from and p_to),
      'conversions', (select coalesce(sum(c.conversion_count), 0) from public.content_campaign c where c.created_at between p_from and p_to)
    )
  )
$$;

revoke all on function public.content_admin_overview(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.content_admin_overview(timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 10. Privileges, RLS, restricted-account guard
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'content_campaign_preset', 'content_campaign', 'content_campaign_checkout',
    'content_campaign_ledger', 'content_campaign_event', 'content_campaign_conversion'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end;
$$;

grant usage, select on sequence public.content_campaign_ledger_id_seq to service_role;
grant usage, select on sequence public.content_campaign_event_id_seq to service_role;
grant usage, select on sequence public.content_campaign_conversion_id_seq to service_role;

-- Advertisers read their own campaigns and checkouts (the service still
-- serves them; this only keeps a direct read safe).
grant select on table public.content_campaign to authenticated;
create policy content_campaign_advertiser_select on public.content_campaign
  for select to authenticated using ((select auth.uid()) = advertiser_id);
grant select on table public.content_campaign_checkout to authenticated;
create policy content_campaign_checkout_owner_select on public.content_campaign_checkout
  for select to authenticated using ((select auth.uid()) = owner_id);

drop trigger if exists guard_restricted_account_trg on public.content_campaign;
create trigger guard_restricted_account_trg
  before insert or update on public.content_campaign
  for each row execute function public.guard_restricted_account();

-- ---------------------------------------------------------------------
-- 11. Jobs
-- ---------------------------------------------------------------------
select cron.unschedule(j.jobname)
from cron.job j
where j.jobname in ('content-campaign-tick', 'expire-stale-content-campaign-checkouts',
                    'content-attribute-conversions', 'content-campaign-reconcile');

select cron.schedule('content-campaign-tick',                   '*/10 * * * *', $$select public.content_campaign_tick();$$);
select cron.schedule('expire-stale-content-campaign-checkouts', '*/5 * * * *',  $$select public.expire_stale_content_campaign_checkouts();$$);
select cron.schedule('content-attribute-conversions',           '35 * * * *',   $$select public.content_attribute_conversions();$$);
select cron.schedule('content-campaign-reconcile',              '10,40 * * * *', $$select public.content_campaign_reconcile();$$);
