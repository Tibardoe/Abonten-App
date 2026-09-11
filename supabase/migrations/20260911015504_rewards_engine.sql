-- Abonten Rewards, Phase 4b: the reward engine (event referrals).
--
--   money-path change ──trigger──► reward_outbox ──cron 1 min──► rewards_process_outbox()
--                                                                 │ evaluate / re-check
--                                                                 ▼
--                                  reward_event (one decision record per referred checkout)
--                                                                 │ live: credit_grant → pending lot
--   rewards_settle_due() (cron 15 min): event settled (end + 48h) and the sale is still
--   good → credit_release_lot (pro rata to the tickets still valid); otherwise void.
--
-- Event referral (owner-approved rule, reward_rule 'event_referral'):
--   reward = min(rate × ticket revenue, net-share cap × that checkout's share of
--   Abonten's net revenue, the per-referrer caps), rounded down to the pesewa.
--
-- SHADOW MODE (reward_program_setting.shadow_mode, ships ON): the engine
-- makes every decision and records it, but posts no credit and sends no
-- notification. A referrer outside the program's audience is also evaluated
-- in shadow. The admin console reads these records to project cost and
-- review risk flags before anything is paid.
--
-- Nothing runs unless the 'event_referral' rule has an active version (all
-- seed versions are inactive), and nothing is stamped for the engine to see
-- unless referral capture is on.

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------

-- Deterministic risk score weights / thresholds; keys override the defaults
-- in _reward_risk_weight (see @abonten/core/rewards/riskScore.ts).
alter table public.reward_program_setting
  add column if not exists risk_weights jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.reward_event (
  id                  uuid        primary key default gen_random_uuid(),
  rule_key            text        not null,
  rule_id             uuid        references public.reward_rule (id),
  rule_version        integer,
  beneficiary_user_id uuid        not null references public.user_info (id) on delete cascade,
  source_type         text        not null check (source_type in ('ticket_checkout')),
  source_id           uuid        not null,
  event_id            uuid        references public.event (id) on delete set null,
  buyer_user_id       uuid,
  transaction_id      uuid,
  idempotency_key     text        not null,
  is_shadow           boolean     not null,
  status              text        not null check (status in (
                        'pending', 'held', 'released', 'voided', 'rejected',
                        'deferred', 'clawed_back')),
  -- What the risk checks decided when the reward was evaluated.
  decision            text        not null check (decision in ('auto', 'review', 'reject')),
  amount_minor        bigint      not null default 0 check (amount_minor >= 0),
  released_minor      bigint      check (released_minor >= 0),
  currency            varchar(3)  not null default 'GHS',
  -- The calculation, for the decision record (inputs, caps, limiting factor).
  basis               jsonb       not null default '{}'::jsonb,
  risk_score          integer     not null default 0,
  -- Never shown to users.
  risk_flags          text[]      not null default '{}',
  status_reason       text,
  lot_id              uuid        references public.credit_lot (id),
  release_at          timestamptz,
  next_check_at       timestamptz,
  budget_period       date,
  notified_pending_at timestamptz,
  reviewed_by         uuid,
  reviewed_at         timestamptz,
  review_note         text,
  settled_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint reward_event_idempotency_key_key unique (idempotency_key)
);

create index if not exists idx_reward_event_due
  on public.reward_event (coalesce(next_check_at, release_at))
  where status = 'pending';
create index if not exists idx_reward_event_status
  on public.reward_event (status, created_at desc);
create index if not exists idx_reward_event_beneficiary
  on public.reward_event (beneficiary_user_id, created_at desc);
create index if not exists idx_reward_event_event on public.reward_event (event_id);
create index if not exists idx_reward_event_source on public.reward_event (source_id);
create index if not exists idx_reward_event_transaction on public.reward_event (transaction_id);
create index if not exists idx_reward_event_buyer_event
  on public.reward_event (buyer_user_id, event_id, rule_key);
create index if not exists idx_reward_event_lot on public.reward_event (lot_id) where lot_id is not null;

create table if not exists public.reward_outbox (
  id               bigint      generated always as identity primary key,
  event_type       text        not null check (event_type in (
                     'checkout_paid', 'checkout_cancelled', 'ticket_cancelled',
                     'transaction_refund', 'event_cancelled', 'event_moderated',
                     'dispute_opened')),
  aggregate_id     uuid        not null,
  payload          jsonb       not null default '{}'::jsonb,
  attempts         integer     not null default 0,
  next_attempt_at  timestamptz not null default now(),
  last_error       text,
  processed_at     timestamptz,
  dead_lettered_at timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists idx_reward_outbox_due
  on public.reward_outbox (next_attempt_at)
  where processed_at is null and dead_lettered_at is null;
create index if not exists idx_reward_outbox_created
  on public.reward_outbox using brin (created_at);

create table if not exists public.risk_signal (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.user_info (id) on delete cascade,
  related_user_id uuid,
  signal_type     text        not null,
  severity        text        not null check (severity in ('info', 'review', 'block')),
  details         jsonb       not null default '{}'::jsonb,
  reward_event_id uuid        references public.reward_event (id) on delete cascade,
  created_at      timestamptz not null default now()
);

create index if not exists idx_risk_signal_user on public.risk_signal (user_id, created_at desc);
create index if not exists idx_risk_signal_event on public.risk_signal (reward_event_id);

-- ---------------------------------------------------------------------
-- Helpers (no grants: only the definer functions below call them)
-- ---------------------------------------------------------------------

-- Gmail ignores dots and "+tags"; every provider ignores "+tags".
create or replace function public._normalized_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then null
    when split_part(lower(p_email), '@', 2) in ('gmail.com', 'googlemail.com') then
      replace(split_part(split_part(lower(p_email), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else
      split_part(split_part(lower(p_email), '@', 1), '+', 1) || '@' || split_part(lower(p_email), '@', 2)
  end;
$$;

-- The card (Paystack authorization signature) or mobile-money wallet a
-- payment came from, from the stored Paystack verification.
create or replace function public._payment_fingerprint(p_response jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_response is null or jsonb_typeof(p_response -> 'authorization') <> 'object' then null
    when coalesce(p_response -> 'authorization' ->> 'signature', '') <> '' then
      'sig:' || (p_response -> 'authorization' ->> 'signature')
    when coalesce(p_response -> 'authorization' ->> 'last4', '') <> '' then
      concat_ws(':',
        p_response -> 'authorization' ->> 'channel',
        p_response -> 'authorization' ->> 'bank',
        p_response -> 'authorization' ->> 'bin',
        p_response -> 'authorization' ->> 'last4',
        p_response -> 'authorization' ->> 'exp_month',
        p_response -> 'authorization' ->> 'exp_year')
  end;
$$;

-- When an event is settled: its last session's end + 48 hours (the same rule
-- as is_event_settled / organizer payouts).
create or replace function public._event_settles_at(p_event_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select max(eo.ends_at) from public.event_occurrence eo where eo.event_id = e.id),
    e.ends_at,
    e.starts_at,
    now()
  ) + interval '48 hours'
  from public.event e
  where e.id = p_event_id;
$$;

create or replace function public._reward_risk_weight(p_flag text, p_weights jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (p_weights ->> p_flag)::integer,
    case p_flag
      when 'shared_device'        then 60
      when 'new_buyer_account'    then 15
      when 'referrer_refund_rate' then 40
      when 'event_concentration'  then 25
      when 'velocity'             then 30
      when 'open_dispute'         then 80
      when 'checked_in'           then -15
      when 'review_threshold'     then 30
      when 'reject_threshold'     then 70
      else 0
    end);
$$;

-- The monthly ceiling: max(floor, share of the trailing 30 days' net
-- platform revenue). Commits p_amount atomically or returns null (budget
-- exhausted -> the reward is deferred to a later month, never dropped).
create or replace function public._reward_commit_budget(p_amount_minor bigint)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period   date := date_trunc('month', now())::date;
  v_settings public.reward_program_setting;
  v_net      bigint;
  v_ok       boolean;
begin
  if not exists (select 1 from public.reward_budget_period b where b.period_start = v_period) then
    select * into v_settings from public.reward_program_setting s where s.id = 1;
    select coalesce(round(sum(f.net_revenue) * 100), 0)::bigint into v_net
    from public.platform_fee_entry f
    where f.entry_type = 'fee' and f.created_at > now() - interval '30 days';
    insert into public.reward_budget_period (period_start, ceiling_minor)
    values (v_period, greatest(v_settings.budget_floor_minor,
                               (v_net * v_settings.budget_net_revenue_share_bps) / 10000))
    on conflict (period_start) do nothing;
  end if;

  update public.reward_budget_period b
  set committed_minor = b.committed_minor + p_amount_minor,
      updated_at      = now()
  where b.period_start = v_period
    and b.committed_minor + p_amount_minor <= b.ceiling_minor
  returning true into v_ok;

  return case when v_ok then v_period end;
end;
$$;

create or replace function public._reward_notify(p_user_id uuid, p_type text, p_title text, p_body text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification (user_id, type, title, body, link, data)
  values (p_user_id, p_type, p_title, p_body, '/rewards', jsonb_build_object('kind', 'rewards'));
$$;

-- Void: the sale behind it didn't hold (refund, cancellation, fraud decision).
create or replace function public._reward_void(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reward_event;
begin
  select * into r from public.reward_event where id = p_id for update;
  if r.status not in ('pending', 'held', 'deferred') then
    return;
  end if;

  if not r.is_shadow and r.lot_id is not null then
    perform public.credit_void_lot(r.lot_id, 'reward.void:' || r.id, 'system', null, p_reason);
  end if;
  if not r.is_shadow and r.budget_period is not null then
    update public.reward_budget_period b
    set committed_minor = greatest(b.committed_minor - r.amount_minor, 0), updated_at = now()
    where b.period_start = r.budget_period;
  end if;

  update public.reward_event e
  set status = 'voided', status_reason = p_reason, settled_at = now(), updated_at = now()
  where e.id = r.id;

  if not r.is_shadow and r.notified_pending_at is not null then
    perform public._reward_notify(
      r.beneficiary_user_id, 'reward_reversed', 'A pending reward was removed',
      case p_reason
        when 'refunded' then 'A ticket you referred was refunded, so its pending reward was removed.'
        when 'cancelled' then 'A ticket you referred was cancelled, so its pending reward was removed.'
        when 'event_cancelled' then 'An event you shared was cancelled, so its pending reward was removed.'
        else 'A pending reward was removed after a review of the sale.'
      end);
  end if;
end;
$$;

-- Re-checks one reward against the current state of the sale.
--   'recheck': something changed (refund, cancellation, dispute...): void or
--              hold now if needed, otherwise leave it.
--   'settle':  it's due: also release it (pro rata to the tickets that are
--              still valid) when everything checks out.
-- Returns the resulting status.
create or replace function public._reward_settle_one(p_id uuid, p_mode text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r               public.reward_event;
  v_tc            record;
  v_event         record;
  v_txn_status    text;
  v_units_total   integer;
  v_units_valid   integer;
  v_dead          text;
  v_suspect       text;
  v_release       bigint;
begin
  select * into r from public.reward_event where id = p_id for update;
  if not found or r.status not in ('pending', 'held', 'deferred', 'released') then
    return r.status;
  end if;

  select tc.id, tc.status into v_tc from public.ticket_checkout tc where tc.id = r.source_id;
  select count(*), count(*) filter (where t.status <> 'cancelled')
    into v_units_total, v_units_valid
  from public.ticket t where t.ticket_checkout_id = r.source_id;
  select t.status into v_txn_status from public.transaction t where t.id = r.transaction_id;
  select e.status, e.moderation_state into v_event from public.event e where e.id = r.event_id;

  v_dead := case
    when v_tc.id is null then 'source_missing'
    when v_event.status = 'canceled' then 'event_cancelled'
    when v_txn_status in ('refund_pending', 'refunded') then 'refunded'
    when v_tc.status <> 'paid' or v_units_valid = 0 then 'cancelled'
    when v_event.moderation_state = 'removed' then 'event_removed'
  end;

  v_suspect := case
    when exists (select 1 from public.payment_dispute d
                 where d.transaction_id = r.transaction_id and d.resolved_at is null) then 'open_dispute'
    when v_event.moderation_state = 'hidden' then 'event_hidden'
    when exists (select 1 from public.user_info u
                 where u.id = r.beneficiary_user_id and u.status_id in (2, 3)) then 'referrer_restricted'
    when exists (select 1 from public.credit_account a
                 where a.user_id = r.beneficiary_user_id and a.status <> 'active') then 'referrer_restricted'
  end;

  if r.status = 'released' then
    -- After release only a chargeback takes credit back.
    if v_suspect = 'open_dispute' then
      if not r.is_shadow and coalesce(r.released_minor, 0) > 0 then
        perform public.credit_debit_available(
          r.beneficiary_user_id, r.released_minor, 'reward.clawback',
          'reward.clawback:' || r.id, true, r.lot_id, 'system', null,
          null, 'Chargeback on the referred sale', 'reward_event', r.id::text, r.id);
      end if;
      update public.reward_event e
      set status = 'clawed_back', status_reason = 'open_dispute', updated_at = now()
      where e.id = r.id;
      return 'clawed_back';
    end if;
    return 'released';
  end if;

  if v_dead is not null then
    perform public._reward_void(r.id, v_dead);
    return 'voided';
  end if;

  if v_suspect is not null then
    if r.status = 'pending' then
      update public.reward_event e
      set status = 'held', status_reason = v_suspect, updated_at = now()
      where e.id = r.id;
    end if;
    return case when r.status = 'deferred' then 'deferred' else 'held' end;
  end if;

  if p_mode <> 'settle' or r.status <> 'pending' or r.release_at > now() then
    return r.status;
  end if;

  -- Live credit only unlocks for a referrer with a verified phone number.
  -- Wait (checking daily) up to 90 days, then give up on it.
  if not r.is_shadow and not exists (
    select 1 from auth.users u where u.id = r.beneficiary_user_id and u.phone_confirmed_at is not null
  ) then
    if r.release_at < now() - interval '90 days' then
      perform public._reward_void(r.id, 'phone_not_verified');
      return 'voided';
    end if;
    update public.reward_event e
    set next_check_at = now() + interval '1 day', status_reason = 'phone_not_verified', updated_at = now()
    where e.id = r.id;
    return 'pending';
  end if;

  v_release := floor(r.amount_minor * v_units_valid::numeric / greatest(v_units_total, 1))::bigint;

  if v_release <= 0 then
    perform public._reward_void(r.id, 'cancelled');
    return 'voided';
  end if;

  if not r.is_shadow then
    perform public.credit_release_lot(r.lot_id, 'reward.release:' || r.id, v_release,
                                      'system', null, null);
    if r.budget_period is not null then
      update public.reward_budget_period b
      set committed_minor = greatest(b.committed_minor - (r.amount_minor - v_release), 0),
          released_minor  = b.released_minor + v_release,
          updated_at      = now()
      where b.period_start = r.budget_period;
    end if;
  end if;

  update public.reward_event e
  set status = 'released', released_minor = v_release, status_reason = null,
      settled_at = now(), updated_at = now()
  where e.id = r.id;
  return 'released';
end;
$$;

-- Accrues a reward that has been decided (pending or held): commits the
-- budget and creates the PENDING credit lot. Shadow rewards do neither.
create or replace function public._reward_accrue(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        public.reward_event;
  v_rule   public.reward_rule;
  v_period date;
  v_lot    uuid;
  v_title  text;
begin
  select * into r from public.reward_event where id = p_id for update;
  if r.is_shadow or r.lot_id is not null or r.status not in ('pending', 'held', 'deferred') then
    return r.status;
  end if;

  v_period := public._reward_commit_budget(r.amount_minor);
  if v_period is null then
    update public.reward_event e
    set status = 'deferred', status_reason = 'budget_exhausted', updated_at = now()
    where e.id = r.id;
    return 'deferred';
  end if;

  select * into v_rule from public.reward_rule where id = r.rule_id;
  select e.title into v_title from public.event e where e.id = r.event_id;

  select g.lot_id into v_lot
  from public.credit_grant(
    r.beneficiary_user_id, r.amount_minor, 'reward.accrue', v_rule.lot_kind, v_rule.spend_scope,
    'reward.accrue:' || r.id, 'system', null,
    coalesce(v_title, 'Event referral'), 'Event referral reward',
    r.release_at + make_interval(days => coalesce(v_rule.expiry_days, 365)),
    r.release_at, false, null, 'reward_event', r.id::text, r.id
  ) g;

  update public.reward_event e
  set lot_id = v_lot, budget_period = v_period,
      status = case when r.decision = 'review' then 'held' else 'pending' end,
      status_reason = case when r.decision = 'review' then 'risk_review' else null end,
      updated_at = now()
  where e.id = r.id;
  return case when r.decision = 'review' then 'held' else 'pending' end;
end;
$$;

-- ---------------------------------------------------------------------
-- The event-referral rule
-- ---------------------------------------------------------------------

create or replace function public._reward_evaluate_event_referral(p_checkout_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tc            public.ticket_checkout;
  v_rule          public.reward_rule;
  v_settings      public.reward_program_setting;
  v_event         record;
  v_txn           record;
  v_fee           record;
  v_key           text := 'event_referral:' || p_checkout_id;
  v_buyer         uuid;
  v_referrer      uuid;
  v_shadow        boolean;
  v_basis         bigint;
  v_net_share     bigint := 0;
  v_by_rate       bigint;
  v_by_net        bigint;
  v_amount        bigint;
  v_limited_by    text := 'rate';
  v_used_event    bigint;
  v_used_month    bigint;
  v_prior_buys    integer;
  v_remaining     bigint;
  v_flags         text[] := '{}';
  v_score         integer := 0;
  v_weights       jsonb;
  v_decision      text := 'auto';
  v_status        text;
  v_reason        text;
  v_buyer_auth    record;
  v_ref_auth      record;
  v_fp            text;
  v_total_done    integer;
  v_total_voided  integer;
  v_event_paid    integer;
  v_event_ref     integer;
  v_id            uuid;
  f               text;
begin
  select * into v_tc from public.ticket_checkout where id = p_checkout_id;
  if not found or v_tc.referrer_user_id is null or v_tc.status <> 'paid' then
    return null;
  end if;
  if exists (select 1 from public.reward_event where idempotency_key = v_key) then
    return null;
  end if;

  -- No active rule version: the mechanism is off (fails closed).
  select * into v_rule from public.reward_rule where rule_key = 'event_referral' and is_active;
  if not found then
    return null;
  end if;

  select * into v_settings from public.reward_program_setting where id = 1;
  v_weights := coalesce(v_settings.risk_weights, '{}'::jsonb);
  v_buyer := v_tc.user_id;
  v_referrer := v_tc.referrer_user_id;
  v_shadow := v_settings.shadow_mode or not public.rewards_enabled_for_user(v_referrer);

  select e.id, e.title, e.organizer_id into v_event from public.event e where e.id = v_tc.event_id;

  select t.id, t.status, t.payment_gateway_response into v_txn
  from public.transaction t
  where t.id = (select tk.transaction_id from public.ticket tk
                where tk.ticket_checkout_id = p_checkout_id and tk.transaction_id is not null
                limit 1);

  v_basis := floor(coalesce(v_tc.total_price, 0) * 100)::bigint;

  if v_txn.id is null or v_basis < v_rule.min_basis_minor then
    v_status := 'rejected';
    v_reason := case when v_txn.id is null then 'no_payment' else 'min_basis' end;
    v_amount := 0;
  else
    -- record_platform_fee runs right after ticket issuance; if the outbox
    -- got here first, fail and let the back-off retry.
    select f.net_revenue, f.ticket_revenue into v_fee
    from public.platform_fee_entry f
    where f.transaction_id = v_txn.id and f.entry_type = 'fee';
    if not found then
      raise exception 'platform fee not recorded yet for transaction %', v_txn.id;
    end if;

    -- This checkout's share of the transaction's net revenue (one charge
    -- can pay for several checkouts).
    if coalesce(v_fee.ticket_revenue, 0) > 0 then
      v_net_share := floor(greatest(v_fee.net_revenue, 0) * 100
                           * (v_tc.total_price / v_fee.ticket_revenue))::bigint;
    end if;

    v_by_rate := floor(v_basis * v_rule.rate_bps / 10000.0)::bigint;
    v_by_net := floor(v_net_share * coalesce(v_rule.net_share_cap_bps, 10000) / 10000.0)::bigint;
    v_amount := v_by_rate;
    if v_by_net < v_amount then
      v_amount := v_by_net;
      v_limited_by := 'net_share_cap';
    end if;

    -- Caps, counted within the same class (shadow / live) so shadow data
    -- never blocks a live reward after the switch.
    select count(*) into v_prior_buys
    from public.reward_event e
    where e.rule_key = 'event_referral' and e.buyer_user_id = v_buyer
      and e.event_id = v_tc.event_id and e.is_shadow = v_shadow
      and e.status not in ('rejected', 'voided');

    select coalesce(sum(e.amount_minor), 0) into v_used_event
    from public.reward_event e
    where e.rule_key = 'event_referral' and e.beneficiary_user_id = v_referrer
      and e.event_id = v_tc.event_id and e.is_shadow = v_shadow
      and e.status in ('pending', 'held', 'released', 'deferred');

    select coalesce(sum(e.amount_minor), 0) into v_used_month
    from public.reward_event e
    where e.rule_key = 'event_referral' and e.beneficiary_user_id = v_referrer
      and e.is_shadow = v_shadow
      and e.created_at >= date_trunc('month', now())
      and e.status in ('pending', 'held', 'released', 'deferred');

    v_remaining := least(
      coalesce((v_rule.caps ->> 'per_referrer_event_minor')::bigint, 9223372036854775807) - v_used_event,
      coalesce((v_rule.caps ->> 'per_referrer_month_minor')::bigint, 9223372036854775807) - v_used_month);
    if v_remaining < v_amount then
      v_amount := greatest(v_remaining, 0);
      v_limited_by := 'referrer_cap';
    end if;

    if v_prior_buys >= coalesce((v_rule.caps ->> 'per_buyer_event_checkouts')::integer, 1) then
      v_status := 'rejected';
      v_reason := 'buyer_event_cap';
    elsif v_amount <= 0 then
      v_status := 'rejected';
      v_reason := case when v_net_share <= 0 then 'no_net_revenue' else v_limited_by end;
    end if;
  end if;

  -- Risk signals (deterministic; see riskScore.ts for the same table).
  if v_buyer = v_referrer then
    v_flags := array_append(v_flags, 'self_referral');
  end if;
  if v_event.organizer_id in (v_buyer, v_referrer) then
    v_flags := array_append(v_flags, 'organizer_linked');
  end if;

  select u.email, u.phone into v_buyer_auth from auth.users u where u.id = v_buyer;
  select u.email, u.phone into v_ref_auth from auth.users u where u.id = v_referrer;
  if public._normalized_email(v_buyer_auth.email) = public._normalized_email(v_ref_auth.email) then
    v_flags := array_append(v_flags, 'same_email');
  end if;
  if coalesce(v_buyer_auth.phone, '') <> '' and coalesce(v_ref_auth.phone, '') <> ''
     and right(regexp_replace(v_buyer_auth.phone, '\D', '', 'g'), 9)
       = right(regexp_replace(v_ref_auth.phone, '\D', '', 'g'), 9) then
    v_flags := array_append(v_flags, 'same_phone');
  end if;

  v_fp := public._payment_fingerprint(v_txn.payment_gateway_response);
  if v_fp is not null and exists (
    select 1 from public.transaction t
    where t.user_id = v_referrer and public._payment_fingerprint(t.payment_gateway_response) = v_fp
  ) then
    v_flags := array_append(v_flags, 'same_payment_method');
  end if;

  if exists (select 1 from public.device_install a
             join public.device_install b on b.install_id = a.install_id
             where a.user_id = v_buyer and b.user_id = v_referrer)
     or exists (select 1 from public.device_token a
                join public.device_token b on b.token = a.token
                where a.user_id = v_buyer and b.user_id = v_referrer) then
    v_flags := array_append(v_flags, 'shared_device');
  end if;

  if exists (select 1 from public.user_info u
             where u.id = v_buyer and u.created_at > now() - interval '24 hours') then
    v_flags := array_append(v_flags, 'new_buyer_account');
  end if;

  select count(*) filter (where e.status in ('released', 'voided', 'clawed_back')),
         count(*) filter (where e.status = 'voided'
                            and e.status_reason in ('refunded', 'cancelled', 'event_cancelled'))
    into v_total_done, v_total_voided
  from public.reward_event e
  where e.beneficiary_user_id = v_referrer and e.rule_key = 'event_referral';
  if v_total_done >= 5 and v_total_voided * 100 >= v_total_done * 30 then
    v_flags := array_append(v_flags, 'referrer_refund_rate');
  end if;

  select count(*), count(*) filter (where tc.referrer_user_id = v_referrer)
    into v_event_paid, v_event_ref
  from public.ticket_checkout tc
  where tc.event_id = v_tc.event_id and tc.status = 'paid' and tc.total_price > 0;
  if v_event_paid >= 10 and v_event_ref * 2 > v_event_paid then
    v_flags := array_append(v_flags, 'event_concentration');
  end if;

  if (select count(*) from public.reward_event e
      where e.beneficiary_user_id = v_referrer and e.created_at > now() - interval '24 hours') >= 20 then
    v_flags := array_append(v_flags, 'velocity');
  end if;

  if v_txn.id is not null and exists (
    select 1 from public.payment_dispute d where d.transaction_id = v_txn.id and d.resolved_at is null
  ) then
    v_flags := array_append(v_flags, 'open_dispute');
  end if;

  if exists (select 1 from public.ticket t where t.ticket_checkout_id = p_checkout_id and t.status = 'used') then
    v_flags := array_append(v_flags, 'checked_in');
  end if;

  foreach f in array v_flags loop
    v_score := v_score + public._reward_risk_weight(f, v_weights);
  end loop;
  v_score := greatest(v_score, 0);

  if v_flags && array['self_referral', 'organizer_linked', 'same_email',
                      'same_phone', 'same_payment_method'] then
    v_decision := 'reject';
  elsif v_score >= public._reward_risk_weight('reject_threshold', v_weights) then
    v_decision := 'reject';
  elsif v_score >= public._reward_risk_weight('review_threshold', v_weights) then
    v_decision := 'review';
  end if;

  if v_status is null then
    if v_decision = 'reject' then
      v_status := 'rejected';
      v_reason := 'risk';
    elsif v_decision = 'review' then
      v_status := 'held';
      v_reason := 'risk_review';
    else
      v_status := 'pending';
    end if;
  end if;

  insert into public.reward_event (
    rule_key, rule_id, rule_version, beneficiary_user_id, source_type, source_id,
    event_id, buyer_user_id, transaction_id, idempotency_key, is_shadow, status,
    decision, amount_minor, basis, risk_score, risk_flags, status_reason, release_at
  ) values (
    'event_referral', v_rule.id, v_rule.version, v_referrer, 'ticket_checkout', p_checkout_id,
    v_tc.event_id, v_buyer, v_txn.id, v_key, v_shadow, v_status,
    v_decision, case when v_status = 'rejected' then 0 else v_amount end,
    jsonb_build_object(
      'ticket_revenue_minor', v_basis,
      'net_revenue_share_minor', v_net_share,
      'rate_bps', v_rule.rate_bps,
      'net_share_cap_bps', v_rule.net_share_cap_bps,
      'by_rate_minor', v_by_rate,
      'by_net_cap_minor', v_by_net,
      'computed_minor', v_amount,
      'limited_by', v_limited_by,
      'referral_code', v_tc.referral_code,
      'referral_source', v_tc.referral_source,
      'touched_at', v_tc.referral_touched_at),
    v_score, v_flags, v_reason, public._event_settles_at(v_tc.event_id)
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    return null;
  end if;

  if array_length(v_flags, 1) > 0 then
    insert into public.risk_signal (user_id, related_user_id, signal_type, severity, details, reward_event_id)
    select v_referrer, v_buyer, fl,
           case when fl in ('self_referral', 'organizer_linked', 'same_email', 'same_phone',
                            'same_payment_method') then 'block'
                when public._reward_risk_weight(fl, v_weights) > 0 then 'review'
                else 'info' end,
           jsonb_build_object('event_id', v_tc.event_id, 'checkout_id', p_checkout_id),
           v_id
    from unnest(v_flags) fl;
  end if;

  if v_status in ('pending', 'held') then
    perform public._reward_accrue(v_id);
    -- The sale may already have changed (a refund processed first).
    perform public._reward_settle_one(v_id, 'recheck');
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------

create or replace function public._reward_dispatch(p_event_type text, p_aggregate_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_event_type = 'checkout_paid' then
    perform public._reward_evaluate_event_referral(p_aggregate_id);
    return;
  end if;

  for v_id in
    select e.id from public.reward_event e
    where e.status in ('pending', 'held', 'deferred', 'released')
      and case
            when p_event_type in ('checkout_cancelled', 'ticket_cancelled') then e.source_id = p_aggregate_id
            when p_event_type in ('transaction_refund', 'dispute_opened') then e.transaction_id = p_aggregate_id
            when p_event_type in ('event_cancelled', 'event_moderated') then e.event_id = p_aggregate_id
            else false
          end
    order by e.id
  loop
    perform public._reward_settle_one(v_id, 'recheck');
  end loop;
end;
$$;

-- Batch of due outbox rows, SKIP LOCKED so overlapping runs never collide.
-- A failing row backs off exponentially; after 8 attempts it is dead-lettered
-- and a critical incident is opened.
create or replace function public.rewards_process_outbox(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o       public.reward_outbox;
  v_done  integer := 0;
begin
  for o in
    select * from public.reward_outbox
    where processed_at is null and dead_lettered_at is null and next_attempt_at <= now()
    order by id
    limit p_limit
    for update skip locked
  loop
    begin
      perform public._reward_dispatch(o.event_type, o.aggregate_id);
      update public.reward_outbox
      set processed_at = now(), attempts = o.attempts + 1, last_error = null
      where id = o.id;
      v_done := v_done + 1;
    exception when others then
      update public.reward_outbox
      set attempts         = o.attempts + 1,
          last_error       = left(sqlerrm, 500),
          next_attempt_at  = now() + make_interval(mins => power(2, least(o.attempts, 8))::integer),
          dead_lettered_at = case when o.attempts + 1 >= 8 then now() end
      where id = o.id;
      if o.attempts + 1 >= 8 then
        perform public.open_reconciliation_incident(
          'rewards.outbox_dead_letter',
          'Reward engine: outbox event(s) failed 8 times',
          format('reward_outbox row %s (%s for %s) was dead-lettered: %s. Fix the cause, then set dead_lettered_at = null and next_attempt_at = now() to retry.',
                 o.id, o.event_type, o.aggregate_id, left(sqlerrm, 300)),
          'critical');
      end if;
    end;
  end loop;
  return v_done;
end;
$$;

-- ---------------------------------------------------------------------
-- Settlement
-- ---------------------------------------------------------------------

create or replace function public.rewards_settle_due(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid;
  v_result   text;
  v_released integer := 0;
  v_voided   integer := 0;
  v_held     integer := 0;
  v_deferred integer := 0;
  -- user id -> pesewas released for them in this run (live only)
  v_notify   jsonb := '{}'::jsonb;
  v_user     uuid;
  v_amount   bigint;
  rec        record;
begin

  for v_id in
    select e.id from public.reward_event e
    where e.status = 'pending' and coalesce(e.next_check_at, e.release_at) <= now()
    order by coalesce(e.next_check_at, e.release_at)
    limit p_limit
    for update skip locked
  loop
    v_result := public._reward_settle_one(v_id, 'settle');
    if v_result = 'released' then
      v_released := v_released + 1;
      select e.beneficiary_user_id, e.released_minor into v_user, v_amount
      from public.reward_event e where e.id = v_id and not e.is_shadow;
      if v_user is not null then
        v_notify := jsonb_set(v_notify, array[v_user::text],
          to_jsonb(coalesce((v_notify ->> v_user::text)::bigint, 0) + v_amount));
      end if;
    elsif v_result = 'voided' then
      v_voided := v_voided + 1;
    elsif v_result = 'held' then
      v_held := v_held + 1;
    end if;
  end loop;

  -- Deferred for budget: try again (a new month, or budget freed by voids).
  for v_id in
    select e.id from public.reward_event e
    where e.status = 'deferred'
    order by e.created_at
    limit p_limit
    for update skip locked
  loop
    if public._reward_settle_one(v_id, 'recheck') = 'deferred' then
      if public._reward_accrue(v_id) <> 'deferred' then
        v_deferred := v_deferred + 1;
      end if;
    end if;
  end loop;

  -- One notification per person per run.
  for rec in
    select key::uuid as user_id, value::text::bigint as amount_minor
    from jsonb_each(v_notify)
  loop
    perform public._reward_notify(
      rec.user_id, 'reward_available', 'Your credit is ready',
      format('GH₵ %s in Abonten Credit is ready to use.', to_char(rec.amount_minor / 100.0, 'FM999999990.00')));
  end loop;

  return jsonb_build_object('released', v_released, 'voided', v_voided,
                            'held', v_held, 'accrued_from_deferred', v_deferred);
end;
$$;

-- Daily digest of new pending rewards, so a busy sharer isn't notified per ticket.
create or replace function public.rewards_notify_pending()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec     record;
  v_count integer := 0;
begin
  for rec in
    select e.beneficiary_user_id as user_id, sum(e.amount_minor) as amount_minor,
           count(*) as n, array_agg(e.id) as ids
    from public.reward_event e
    where not e.is_shadow and e.status = 'pending' and e.notified_pending_at is null
    group by e.beneficiary_user_id
  loop
    perform public._reward_notify(
      rec.user_id, 'reward_pending', 'You have a reward on the way',
      format('GH₵ %s is pending from %s referred %s. It unlocks after the %s.',
             to_char(rec.amount_minor / 100.0, 'FM999999990.00'), rec.n,
             case when rec.n = 1 then 'ticket' else 'tickets' end,
             case when rec.n = 1 then 'event' else 'events' end));
    update public.reward_event e set notified_pending_at = now() where e.id = any (rec.ids);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Admin review of held rewards (called by the admin console after its own
-- permission, step-up and audit checks)
-- ---------------------------------------------------------------------

create or replace function public.reward_review_decision(
  p_reward_event_id uuid,
  p_admin_id        uuid,
  p_approve         boolean,
  p_note            text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reward_event;
begin
  if coalesce(length(trim(p_note)), 0) < 5 then
    raise exception 'A note is required' using errcode = '22023';
  end if;

  select * into r from public.reward_event where id = p_reward_event_id for update;
  if not found then
    raise exception 'Reward not found' using errcode = 'P0002';
  end if;
  if r.status <> 'held' then
    raise exception 'Only a reward held for review can be decided (it is %)', r.status
      using errcode = '55000';
  end if;

  update public.reward_event e
  set reviewed_by = p_admin_id, reviewed_at = now(), review_note = trim(p_note), updated_at = now()
  where e.id = r.id;

  if p_approve then
    -- Released at the next settlement run once the event has settled; the
    -- sale is still re-checked then.
    update public.reward_event e
    set status = 'pending', status_reason = null, next_check_at = null
    where e.id = r.id;
    return 'pending';
  end if;

  perform public._reward_void(r.id, 'rejected_by_review');
  return 'voided';
end;
$$;

-- Switches which version of a rule is live (or none), in one statement so
-- there is never a moment with two active versions. Called by the admin
-- console after its permission / step-up / second-admin checks.
create or replace function public.reward_rule_set_active(p_rule_key text, p_rule_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_rule_id is not null and not exists (
    select 1 from public.reward_rule r where r.id = p_rule_id and r.rule_key = p_rule_key
  ) then
    raise exception 'Rule version not found' using errcode = 'P0002';
  end if;

  update public.reward_rule r
  set is_active = false
  where r.rule_key = p_rule_key and r.is_active and r.id is distinct from p_rule_id;

  if p_rule_id is not null then
    update public.reward_rule r set is_active = true where r.id = p_rule_id and not r.is_active;
  end if;
end;
$$;

-- Health for the admin Monitoring probe (check_key 'rewards').
create or replace function public.rewards_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'outbox_lag_seconds', coalesce((
      select extract(epoch from now() - min(o.created_at))::integer
      from public.reward_outbox o
      where o.processed_at is null and o.dead_lettered_at is null), 0),
    'outbox_dead_letters', (
      select count(*) from public.reward_outbox o where o.dead_lettered_at is not null),
    'settlement_backlog', (
      select count(*) from public.reward_event e
      where e.status = 'pending'
        and coalesce(e.next_check_at, e.release_at) < now() - interval '1 hour'),
    'held', (select count(*) from public.reward_event e where e.status = 'held'),
    'deferred', (select count(*) from public.reward_event e where e.status = 'deferred'),
    'released_without_journal', (
      select count(*) from public.reward_event e
      where e.status = 'released' and not e.is_shadow
        and not exists (select 1 from public.credit_journal j
                        where j.idempotency_key = 'reward.release:' || e.id))
  );
$$;

-- ---------------------------------------------------------------------
-- Emission triggers (one tiny insert, same transaction as the change)
-- ---------------------------------------------------------------------

create or replace function public.reward_emit_ticket_checkout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.referrer_user_id is not null and new.status is distinct from old.status then
    if new.status = 'paid' then
      insert into public.reward_outbox (event_type, aggregate_id) values ('checkout_paid', new.id);
    elsif old.status = 'paid' then
      insert into public.reward_outbox (event_type, aggregate_id) values ('checkout_cancelled', new.id);
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.reward_emit_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled'
     and new.ticket_checkout_id is not null
     and exists (select 1 from public.reward_event e where e.source_id = new.ticket_checkout_id) then
    insert into public.reward_outbox (event_type, aggregate_id)
    values ('ticket_cancelled', new.ticket_checkout_id);
  end if;
  return null;
end;
$$;

create or replace function public.reward_emit_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('refund_pending', 'refunded') and new.status is distinct from old.status
     and exists (select 1 from public.reward_event e where e.transaction_id = new.id) then
    insert into public.reward_outbox (event_type, aggregate_id) values ('transaction_refund', new.id);
  end if;
  return null;
end;
$$;

create or replace function public.reward_emit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.reward_event e
                 where e.event_id = new.id and e.status in ('pending', 'held', 'deferred')) then
    return null;
  end if;
  if new.status = 'canceled' and old.status is distinct from 'canceled' then
    insert into public.reward_outbox (event_type, aggregate_id) values ('event_cancelled', new.id);
  elsif new.moderation_state in ('hidden', 'removed')
        and old.moderation_state is distinct from new.moderation_state then
    insert into public.reward_outbox (event_type, aggregate_id) values ('event_moderated', new.id);
  end if;
  return null;
end;
$$;

create or replace function public.reward_emit_dispute()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.transaction_id is not null and new.resolved_at is null
     and (tg_op = 'INSERT' or old.transaction_id is distinct from new.transaction_id)
     and exists (select 1 from public.reward_event e where e.transaction_id = new.transaction_id) then
    insert into public.reward_outbox (event_type, aggregate_id)
    values ('dispute_opened', new.transaction_id);
  end if;
  return null;
end;
$$;

drop trigger if exists reward_emit on public.ticket_checkout;
create trigger reward_emit
  after update of status on public.ticket_checkout
  for each row execute function public.reward_emit_ticket_checkout();

drop trigger if exists reward_emit on public.ticket;
create trigger reward_emit
  after update of status on public.ticket
  for each row execute function public.reward_emit_ticket();

drop trigger if exists reward_emit on public.transaction;
create trigger reward_emit
  after update of status on public.transaction
  for each row execute function public.reward_emit_transaction();

drop trigger if exists reward_emit on public.event;
create trigger reward_emit
  after update of status, moderation_state on public.event
  for each row execute function public.reward_emit_event();

drop trigger if exists reward_emit on public.payment_dispute;
create trigger reward_emit
  after insert or update of transaction_id on public.payment_dispute
  for each row execute function public.reward_emit_dispute();

-- ---------------------------------------------------------------------
-- RLS + privileges: nothing here is readable or writable by clients. The
-- user sees their rewards as credit lots / activity through the existing
-- sanitized read RPCs.
-- ---------------------------------------------------------------------

alter table public.reward_event enable row level security;
alter table public.reward_outbox enable row level security;
alter table public.risk_signal enable row level security;

revoke all on table public.reward_event, public.reward_outbox, public.risk_signal
  from anon, authenticated;
grant all on table public.reward_event, public.reward_outbox, public.risk_signal
  to service_role;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public._normalized_email(text)',
    'public._payment_fingerprint(jsonb)',
    'public._event_settles_at(uuid)',
    'public._reward_risk_weight(text, jsonb)',
    'public._reward_commit_budget(bigint)',
    'public._reward_notify(uuid, text, text, text)',
    'public._reward_void(uuid, text)',
    'public._reward_settle_one(uuid, text)',
    'public._reward_accrue(uuid)',
    'public._reward_evaluate_event_referral(uuid)',
    'public._reward_dispatch(text, uuid)',
    'public.reward_emit_ticket_checkout()',
    'public.reward_emit_ticket()',
    'public.reward_emit_transaction()',
    'public.reward_emit_event()',
    'public.reward_emit_dispute()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', fn);
  end loop;

  foreach fn in array array[
    'public.rewards_process_outbox(integer)',
    'public.rewards_settle_due(integer)',
    'public.rewards_notify_pending()',
    'public.reward_review_decision(uuid, uuid, boolean, text)',
    'public.reward_rule_set_active(text, uuid)',
    'public.rewards_health()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

select cron.schedule('rewards-process-outbox', '* * * * *',
  $cron$select public.rewards_process_outbox(200);$cron$);
select cron.schedule('rewards-settle-due', '*/15 * * * *',
  $cron$select public.rewards_settle_due(500);$cron$);
select cron.schedule('rewards-notify-pending', '0 18 * * *',
  $cron$select public.rewards_notify_pending();$cron$);
