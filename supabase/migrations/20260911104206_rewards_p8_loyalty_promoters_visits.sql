-- Abonten Rewards, Phase 8: loyalty fee rebate, organizer-funded promoter
-- commissions, verified place visits. All three ship with their rule
-- switched OFF, and everything below respects shadow mode.
--
-- 1. loyalty_fee_rebate (Abonten-funded, budget-gated)
--      checkout paid ──► every Nth (default 5th) ticket order of GH₵ 20+ on
--      a DIFFERENT event within 90 days ──► the service fee that order paid
--      in CASH comes back as reward credit (max GH₵ 10), pending until the
--      event settles. Own events don't count. A reward starts a new count.
--
-- 2. promoter_commission (ORGANIZER-funded, outside Abonten's budget)
--      the organizer sets 1–30% on an event (event_promoter_commission) ──►
--      a paid checkout stamped with someone's referral code (the existing
--      ?ref capture) ──► that promoter gets rate × ticket price as reward
--      credit after the event; the SAME amount is charged to the organizer
--      at once as a pending 'promoter_commission' organizer_ledger_entry
--      (so it can never be paid out first), given back
--      ('promoter_commission_reversal') if the sale is refunded, cancelled
--      or rejected, pro rata for cancelled tickets, and on a chargeback.
--      Owner decision 2026-09-11: promoters are paid in Abonten Credit, not
--      cash (no cash to non-organizers in version 1).
--
-- 3. place_visits (Abonten-funded, monthly)
--      the owner shows a QR code that changes every 30 seconds
--      (place_visit_code) ──► a visitor scans it in the app / on the web
--      within ~150 m of the place (place_visit_record: once per person per
--      place per day) ──► the monthly run pays the owner of a VERIFIED
--      place GH₵ 0.50 promotion credit per different verified visitor
--      (max 40 a month). The owner, look-alike accounts, mocked locations
--      and accounts younger than a day don't count.

-- ---------------------------------------------------------------------
-- Rule keys, sources, launch rules (inactive)
-- ---------------------------------------------------------------------

alter table public.reward_rule drop constraint reward_rule_rule_key_check;
alter table public.reward_rule add constraint reward_rule_rule_key_check
  check (rule_key = any (array[
    'event_referral', 'friend_referral_referrer', 'friend_referral_referee',
    'organizer_rebate', 'venue_rebate', 'organizer_milestone',
    'loyalty_fee_rebate', 'promoter_commission', 'place_visits']));

alter table public.reward_event drop constraint reward_event_source_type_check;
alter table public.reward_event add constraint reward_event_source_type_check
  check (source_type = any (array['ticket_checkout', 'user_referral', 'event', 'place_claim', 'place']));

insert into public.reward_rule (
  rule_key, version, is_active, rate_bps, net_share_cap_bps, flat_minor, min_basis_minor,
  caps, release_policy, release_delay, lot_kind, spend_scope, expiry_days, withdrawable, note
) values
  ('loyalty_fee_rebate', 1, false, 10000, null, null, 2000,
   '{"orders_required": 5, "window_days": 90, "max_per_reward_minor": 1000}'::jsonb,
   'event_settled', null, 'reward', 'any', 365, false,
   'Launch default: every 5th ticket order of GH₵ 20 or more (different events, within 90 days) gets the service fee it paid in cash back as credit after the event, up to GH₵ 10.'),
  ('promoter_commission', 1, false, null, null, null, 0,
   '{"min_rate_bps": 100, "max_rate_bps": 3000}'::jsonb,
   'event_settled', null, 'reward', 'any', 365, false,
   'Launch default: organizers choose 1–30% of the ticket price per event; the organizer pays it as Abonten Credit to whoever''s link sold the ticket, after the event.'),
  ('place_visits', 1, false, null, null, 50, 0,
   '{"max_visitors_per_month": 40, "radius_m": 150, "min_visitor_account_age_hours": 24}'::jsonb,
   'monthly', null, 'promotion', 'promotions', 180, false,
   'Launch default: GH₵ 0.50 of promotion credit per different verified visitor in a month (up to 40), to the owner of a verified place.')
on conflict (rule_key, version) do nothing;

-- ---------------------------------------------------------------------
-- Organizer ledger: commission charged / given back
-- ---------------------------------------------------------------------

alter table public.organizer_ledger_entry drop constraint organizer_ledger_entry_entry_type_check;
alter table public.organizer_ledger_entry add constraint organizer_ledger_entry_entry_type_check
  check (entry_type = any (array[
    'earning', 'refund_adjustment', 'refund_hold', 'refund_release',
    'payout_hold', 'payout_release', 'promoter_commission', 'promoter_commission_reversal']));
alter table public.organizer_ledger_entry add constraint organizer_ledger_entry_commission_check
  check (entry_type not in ('promoter_commission', 'promoter_commission_reversal')
         or (event_id is not null and ticket_checkout_id is not null));
create unique index if not exists organizer_ledger_entry_commission_once
  on public.organizer_ledger_entry (ticket_checkout_id) where entry_type = 'promoter_commission';

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- The commission an organizer offers on one event. Public to read (sharers
-- see "earn 10%"); written only by @abonten/services after an ownership
-- check.
create table if not exists public.event_promoter_commission (
  event_id    uuid        primary key references public.event(id) on delete cascade,
  rate_bps    integer     not null check (rate_bps between 1 and 10000),
  is_active   boolean     not null default true,
  updated_by  uuid        references public.user_info(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.event_promoter_commission enable row level security;
revoke all on table public.event_promoter_commission from anon, authenticated;
grant select on table public.event_promoter_commission to anon, authenticated;
grant all on table public.event_promoter_commission to service_role;
-- Everyone sees an active offer; the organizer also sees a switched-off one.
create policy event_promoter_commission_select
  on public.event_promoter_commission for select to anon, authenticated
  using (is_active
         or exists (select 1 from public.event e
                    where e.id = event_promoter_commission.event_id
                      and e.organizer_id = (select auth.uid())));

-- The secret behind a place's rotating visit code. Never readable by
-- clients.
create table if not exists public.place_visit_key (
  place_id    uuid        primary key references public.place(id) on delete cascade,
  secret      bytea       not null default extensions.gen_random_bytes(32),
  created_at  timestamptz not null default now()
);

alter table public.place_visit_key enable row level security;
revoke all on table public.place_visit_key from anon, authenticated;
grant all on table public.place_visit_key to service_role;

-- One verified visit per person per place per day (Accra time = UTC).
create table if not exists public.place_visit (
  id          uuid        primary key default gen_random_uuid(),
  place_id    uuid        not null references public.place(id) on delete cascade,
  user_id     uuid        not null references public.user_info(id) on delete cascade,
  visited_on  date        not null,
  distance_m  integer     not null check (distance_m >= 0),
  accuracy_m  integer,
  platform    text        not null check (platform in ('android', 'ios', 'web')),
  install_id  text,
  created_at  timestamptz not null default now(),
  constraint place_visit_once_a_day unique (place_id, user_id, visited_on)
);

create index if not exists idx_place_visit_place_day on public.place_visit (place_id, visited_on);
create index if not exists idx_place_visit_user on public.place_visit (user_id, created_at desc);

alter table public.place_visit enable row level security;
revoke all on table public.place_visit from anon, authenticated;
grant select on table public.place_visit to authenticated;
grant all on table public.place_visit to service_role;
create policy place_visit_own_select
  on public.place_visit for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 1. Loyalty fee rebate
-- ---------------------------------------------------------------------

-- The buyer's orders that count towards the loyalty reward, one row per
-- event: standing paid ticket orders of p_min_minor or more, on events they
-- don't organize, first paid after p_since.
create or replace function public._reward_loyalty_events(p_user_id uuid, p_since timestamptz, p_min_minor bigint)
returns table (event_id uuid, first_paid_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select tc.event_id, min(coalesce(tc.completed_at, tc.created_at::timestamptz))
  from public.ticket_checkout tc
  join public.event e on e.id = tc.event_id
  where tc.user_id = p_user_id
    and tc.status = 'paid'
    and floor(tc.total_price * 100) >= greatest(p_min_minor, 1)
    and e.organizer_id <> p_user_id
    and coalesce(tc.completed_at, tc.created_at::timestamptz) > p_since
    and exists (
      select 1
      from public.ticket t
      left join public.transaction x on x.id = t.transaction_id
      where t.ticket_checkout_id = tc.id
        and t.status <> 'cancelled'
        and (x.id is null or x.status not in ('refund_pending', 'refunded')))
  group by tc.event_id;
$$;

-- Where the buyer's current count starts: the paid time of their last
-- loyalty reward (same shadow class), or the start of the window.
create or replace function public._reward_loyalty_cycle_start(
  p_user_id uuid, p_shadow boolean, p_window_days integer, p_at timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    p_at - make_interval(days => p_window_days),
    coalesce((
      select max((e.basis ->> 'paid_at')::timestamptz)
      from public.reward_event e
      where e.rule_key = 'loyalty_fee_rebate'
        and e.buyer_user_id = p_user_id
        and e.is_shadow = p_shadow
        and e.status in ('pending', 'held', 'released', 'deferred')
        and (e.basis ->> 'paid_at')::timestamptz < p_at), '-infinity'::timestamptz));
$$;

create or replace function public._reward_loyalty_evaluate(p_checkout_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tc        public.ticket_checkout;
  v_rule      public.reward_rule;
  v_settings  public.reward_program_setting;
  v_event     record;
  v_txn       record;
  v_fee       record;
  v_key       text := 'loyalty_fee_rebate:' || p_checkout_id;
  v_shadow    boolean;
  v_basis     bigint;
  v_paid_at   timestamptz;
  v_required  integer;
  v_window    integer;
  v_since     timestamptz;
  v_prior     integer;
  v_repeat    boolean;
  v_fee_minor bigint := 0;
  v_cash_fee  bigint := 0;
  v_cap       bigint;
  v_amount    bigint := 0;
  v_flags     text[] := '{}';
  v_score     integer := 0;
  v_weights   jsonb;
  v_decision  text := 'auto';
  v_status    text;
  v_reason    text;
  v_id        uuid;
  f           text;
begin
  select * into v_tc from public.ticket_checkout where id = p_checkout_id;
  if not found or v_tc.status <> 'paid' or v_tc.user_id is null then
    return null;
  end if;
  select * into v_rule from public.reward_rule where rule_key = 'loyalty_fee_rebate' and is_active;
  if not found then
    return null;
  end if;
  if exists (select 1 from public.reward_event where idempotency_key = v_key) then
    return null;
  end if;

  select e.id, e.title, e.organizer_id into v_event from public.event e where e.id = v_tc.event_id;
  -- Tickets to your own events never count.
  if v_event.organizer_id = v_tc.user_id then
    return null;
  end if;
  v_basis := floor(coalesce(v_tc.total_price, 0) * 100)::bigint;
  if v_basis < greatest(v_rule.min_basis_minor, 1) then
    return null;
  end if;

  select * into v_settings from public.reward_program_setting where id = 1;
  v_weights := coalesce(v_settings.risk_weights, '{}'::jsonb);
  v_shadow := v_settings.shadow_mode or not public.rewards_enabled_for_user(v_tc.user_id);
  v_required := greatest(coalesce((v_rule.caps ->> 'orders_required')::integer, 5), 2);
  v_window := coalesce((v_rule.caps ->> 'window_days')::integer, 90);
  v_paid_at := coalesce(v_tc.completed_at, v_tc.created_at::timestamptz);
  v_since := public._reward_loyalty_cycle_start(v_tc.user_id, v_shadow, v_window, v_paid_at);

  -- Orders before this one in the current count, one per event.
  select count(*) filter (where q.event_id <> v_tc.event_id),
         coalesce(bool_or(q.event_id = v_tc.event_id), false)
    into v_prior, v_repeat
  from public._reward_loyalty_events(v_tc.user_id, v_since, v_rule.min_basis_minor) q
  where q.first_paid_at < v_paid_at;

  -- A second order for an event already counted doesn't move the count;
  -- before the Nth order there's nothing to decide.
  if v_repeat or coalesce(v_prior, 0) + 1 < v_required then
    return null;
  end if;

  select t.id, t.amount, t.credit_amount into v_txn
  from public.transaction t
  where t.id = (select tk.transaction_id from public.ticket tk
                where tk.ticket_checkout_id = p_checkout_id and tk.transaction_id is not null
                limit 1);
  if v_txn.id is null then
    return null;
  end if;

  select f.service_fee, f.ticket_revenue into v_fee
  from public.platform_fee_entry f
  where f.transaction_id = v_txn.id and f.entry_type = 'fee';
  if not found then
    raise exception 'platform fee not recorded yet for transaction %', v_txn.id;
  end if;

  -- This order's share of the service fee, and of that the part paid in
  -- cash (credit spent on the order is already Abonten's cost).
  if coalesce(v_fee.ticket_revenue, 0) > 0 then
    v_fee_minor := floor(greatest(v_fee.service_fee, 0) * 100
                         * (v_tc.total_price / v_fee.ticket_revenue))::bigint;
  end if;
  if coalesce(v_txn.amount, 0) + coalesce(v_txn.credit_amount, 0) > 0 then
    v_cash_fee := floor(v_fee_minor * coalesce(v_txn.amount, 0)
                        / (coalesce(v_txn.amount, 0) + coalesce(v_txn.credit_amount, 0)))::bigint;
  end if;

  v_cap := coalesce((v_rule.caps ->> 'max_per_reward_minor')::bigint, 1000);
  v_amount := least(floor(v_cash_fee * coalesce(v_rule.rate_bps, 10000) / 10000.0)::bigint, v_cap);
  if v_amount <= 0 then
    v_status := 'rejected';
    v_reason := 'no_cash_fee';
    v_amount := 0;
  end if;

  if exists (select 1 from public.payment_dispute d
             where d.transaction_id = v_txn.id and d.resolved_at is null) then
    v_flags := array_append(v_flags, 'open_dispute');
  end if;
  if exists (select 1 from public.ticket t where t.ticket_checkout_id = p_checkout_id and t.status = 'used') then
    v_flags := array_append(v_flags, 'checked_in');
  end if;

  foreach f in array v_flags loop
    v_score := v_score + public._reward_risk_weight(f, v_weights);
  end loop;
  v_score := greatest(v_score, 0);
  if v_score >= public._reward_risk_weight('reject_threshold', v_weights) then
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
    'loyalty_fee_rebate', v_rule.id, v_rule.version, v_tc.user_id, 'ticket_checkout', p_checkout_id,
    v_tc.event_id, v_tc.user_id, v_txn.id, v_key, v_shadow, v_status,
    v_decision, v_amount,
    jsonb_build_object(
      'paid_at', v_paid_at,
      'orders_required', v_required,
      'orders_counted', v_prior + 1,
      'window_days', v_window,
      'ticket_revenue_minor', v_basis,
      'service_fee_minor', v_fee_minor,
      'cash_fee_minor', v_cash_fee,
      'fee_share_bps', v_rule.rate_bps,
      'max_per_reward_minor', v_cap),
    v_score, v_flags, v_reason, public._event_settles_at(v_tc.event_id)
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    return null;
  end if;

  if array_length(v_flags, 1) > 0 then
    insert into public.risk_signal (user_id, related_user_id, signal_type, severity, details, reward_event_id)
    select v_tc.user_id, null, fl,
           case when public._reward_risk_weight(fl, v_weights) > 0 then 'review' else 'info' end,
           jsonb_build_object('event_id', v_tc.event_id, 'checkout_id', p_checkout_id),
           v_id
    from unnest(v_flags) fl;
  end if;

  if v_status in ('pending', 'held') then
    perform public._reward_accrue(v_id);
    perform public._reward_settle_one(v_id, 'recheck');

    if not v_shadow and exists (select 1 from public.reward_event e
                                where e.id = v_id and e.status = 'pending') then
      perform public._reward_notify(
        v_tc.user_id, 'loyalty_reward', 'Your service fee is coming back',
        format('You''ve bought tickets to %s different events. The GH₵ %s service fee on this order comes back as credit after %s.',
               v_required,
               to_char(v_amount / 100.0, 'FM999999990.00'),
               coalesce(v_event.title, 'the event')));
      update public.reward_event e set notified_pending_at = now() where e.id = v_id;
    end if;
  end if;

  return v_id;
end;
$$;

-- The caller's progress towards the next loyalty reward (Rewards page).
create or replace function public.loyalty_progress(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rule     public.reward_rule;
  v_shadow   boolean;
  v_required integer;
  v_window   integer;
  v_since    timestamptz;
  v_count    integer;
  v_oldest   timestamptz;
begin
  select * into v_rule from public.reward_rule where rule_key = 'loyalty_fee_rebate' and is_active;
  if not found or p_user_id is null then
    return null;
  end if;

  v_shadow := (select s.shadow_mode from public.reward_program_setting s where s.id = 1)
              or not public.rewards_enabled_for_user(p_user_id);
  v_required := greatest(coalesce((v_rule.caps ->> 'orders_required')::integer, 5), 2);
  v_window := coalesce((v_rule.caps ->> 'window_days')::integer, 90);
  v_since := public._reward_loyalty_cycle_start(p_user_id, v_shadow, v_window, now());

  select count(*), min(q.first_paid_at) into v_count, v_oldest
  from public._reward_loyalty_events(p_user_id, v_since, v_rule.min_basis_minor) q;

  return jsonb_build_object(
    'orders_required', v_required,
    'window_days', v_window,
    'min_order_minor', v_rule.min_basis_minor,
    'fee_share_bps', v_rule.rate_bps,
    'max_per_reward_minor', coalesce((v_rule.caps ->> 'max_per_reward_minor')::bigint, 1000),
    -- A reward being processed can briefly leave the count at N.
    'orders_counted', least(v_count, v_required),
    -- When the oldest counted order drops out of the window.
    'oldest_counts_until', case when v_oldest is null then null
                                else v_oldest + make_interval(days => v_window) end,
    'pending_minor', coalesce((
      select sum(e.amount_minor) from public.reward_event e
      where e.beneficiary_user_id = p_user_id and e.rule_key = 'loyalty_fee_rebate'
        and not e.is_shadow and e.status in ('pending', 'held', 'deferred')), 0),
    'earned_minor', coalesce((
      select sum(e.released_minor) from public.reward_event e
      where e.beneficiary_user_id = p_user_id and e.rule_key = 'loyalty_fee_rebate'
        and not e.is_shadow and e.status = 'released'), 0)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Promoter commissions (organizer-funded)
-- ---------------------------------------------------------------------

-- Charges (p_delta_minor < 0, once per checkout) or gives back
-- (p_delta_minor > 0, never more than was charged) the commission on the
-- organizer's ledger. Live rewards only.
create or replace function public._promoter_commission_post(p_reward_event_id uuid, p_delta_minor bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r           public.reward_event;
  v_organizer uuid;
  v_currency  text;
  v_charged   numeric := 0;
  v_returned  numeric := 0;
  v_amount    numeric;
begin
  if coalesce(p_delta_minor, 0) = 0 then
    return;
  end if;
  select * into r from public.reward_event where id = p_reward_event_id;
  if not found or r.rule_key <> 'promoter_commission' or r.is_shadow then
    return;
  end if;

  select le.organizer_id, le.currency into v_organizer, v_currency
  from public.organizer_ledger_entry le
  where le.ticket_checkout_id = r.source_id and le.entry_type = 'earning';
  if v_organizer is null then
    -- record_organizer_earning runs right after ticket issuance; retry.
    raise exception 'organizer earning not recorded yet for checkout %', r.source_id;
  end if;

  select coalesce(sum(-le.amount) filter (where le.entry_type = 'promoter_commission'), 0),
         coalesce(sum(le.amount) filter (where le.entry_type = 'promoter_commission_reversal'), 0)
    into v_charged, v_returned
  from public.organizer_ledger_entry le
  where le.ticket_checkout_id = r.source_id
    and le.entry_type in ('promoter_commission', 'promoter_commission_reversal');

  if p_delta_minor < 0 then
    if v_charged > 0 then
      return;
    end if;
    insert into public.organizer_ledger_entry (
      organizer_id, event_id, ticket_checkout_id, transaction_id, entry_type, amount, currency)
    values (v_organizer, r.event_id, r.source_id, r.transaction_id, 'promoter_commission',
            round(p_delta_minor / 100.0, 2), v_currency)
    on conflict (ticket_checkout_id) where entry_type = 'promoter_commission' do nothing;
  else
    v_amount := least(round(p_delta_minor / 100.0, 2), v_charged - v_returned);
    if v_amount > 0 then
      insert into public.organizer_ledger_entry (
        organizer_id, event_id, ticket_checkout_id, transaction_id, entry_type, amount, currency)
      values (v_organizer, r.event_id, r.source_id, r.transaction_id, 'promoter_commission_reversal',
              v_amount, v_currency);
    end if;
  end if;
end;
$$;

create or replace function public._reward_evaluate_promoter_commission(p_checkout_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tc        public.ticket_checkout;
  v_rule      public.reward_rule;
  v_settings  public.reward_program_setting;
  v_event     record;
  v_txn       record;
  v_key       text := 'promoter_commission:' || p_checkout_id;
  v_rate      integer;
  v_min_rate  integer;
  v_max_rate  integer;
  v_buyer     uuid;
  v_promoter  uuid;
  v_shadow    boolean;
  v_basis     bigint;
  v_currency  text;
  v_amount    bigint := 0;
  v_flags     text[] := '{}';
  v_score     integer := 0;
  v_weights   jsonb;
  v_decision  text := 'auto';
  v_status    text;
  v_reason    text;
  v_id        uuid;
  f           text;
begin
  select * into v_tc from public.ticket_checkout where id = p_checkout_id;
  if not found or v_tc.referrer_user_id is null or v_tc.status <> 'paid' then
    return null;
  end if;
  if exists (select 1 from public.reward_event where idempotency_key = v_key) then
    return null;
  end if;
  select * into v_rule from public.reward_rule where rule_key = 'promoter_commission' and is_active;
  if not found then
    return null;
  end if;
  select c.rate_bps into v_rate
  from public.event_promoter_commission c
  where c.event_id = v_tc.event_id and c.is_active;
  if v_rate is null then
    return null;
  end if;
  v_min_rate := coalesce((v_rule.caps ->> 'min_rate_bps')::integer, 100);
  v_max_rate := coalesce((v_rule.caps ->> 'max_rate_bps')::integer, 3000);
  v_rate := least(greatest(v_rate, v_min_rate), v_max_rate);

  select e.id, e.title, e.organizer_id into v_event from public.event e where e.id = v_tc.event_id;
  select * into v_settings from public.reward_program_setting where id = 1;
  v_weights := coalesce(v_settings.risk_weights, '{}'::jsonb);
  v_buyer := v_tc.user_id;
  v_promoter := v_tc.referrer_user_id;
  v_shadow := v_settings.shadow_mode
              or not public.rewards_enabled_for_user(v_promoter)
              or not public.rewards_enabled_for_user(v_event.organizer_id);

  select t.id, t.payment_gateway_response into v_txn
  from public.transaction t
  where t.id = (select tk.transaction_id from public.ticket tk
                where tk.ticket_checkout_id = p_checkout_id and tk.transaction_id is not null
                limit 1);
  select le.currency into v_currency
  from public.organizer_ledger_entry le
  where le.ticket_checkout_id = p_checkout_id and le.entry_type = 'earning';

  v_basis := floor(coalesce(v_tc.total_price, 0) * 100)::bigint;
  v_amount := floor(v_basis * v_rate / 10000.0)::bigint;

  if v_txn.id is null then
    v_status := 'rejected';
    v_reason := 'no_payment';
  elsif v_currency is null then
    raise exception 'organizer earning not recorded yet for checkout %', p_checkout_id;
  elsif v_currency <> 'GHS' then
    v_status := 'rejected';
    v_reason := 'currency';
  elsif v_basis < greatest(v_rule.min_basis_minor, 1) then
    v_status := 'rejected';
    v_reason := 'min_basis';
  elsif v_amount <= 0 then
    v_status := 'rejected';
    v_reason := 'no_commission';
  end if;

  -- The organizer's money: a promoter who is really the buyer would turn
  -- the organizer's commission into a discount for themselves.
  if v_buyer = v_promoter then
    v_flags := array_append(v_flags, 'self_referral');
  end if;
  if v_event.organizer_id in (v_buyer, v_promoter) then
    v_flags := array_append(v_flags, 'organizer_linked');
  end if;
  v_flags := v_flags || public._reward_same_person_flags(v_buyer, v_promoter);
  if v_txn.id is not null
     and public._payment_fingerprint(v_txn.payment_gateway_response) is not null
     and exists (select 1 from public.transaction t
                 where t.user_id = v_promoter
                   and public._payment_fingerprint(t.payment_gateway_response)
                     = public._payment_fingerprint(v_txn.payment_gateway_response)) then
    v_flags := array_append(v_flags, 'same_payment_method');
  end if;
  if exists (select 1 from public.user_info u
             where u.id = v_buyer and u.created_at > now() - interval '24 hours') then
    v_flags := array_append(v_flags, 'new_buyer_account');
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
    'promoter_commission', v_rule.id, v_rule.version, v_promoter, 'ticket_checkout', p_checkout_id,
    v_tc.event_id, v_buyer, v_txn.id, v_key, v_shadow, v_status,
    v_decision, case when v_status = 'rejected' then 0 else v_amount end,
    jsonb_build_object(
      'ticket_revenue_minor', v_basis,
      'rate_bps', v_rate,
      'computed_minor', v_amount,
      'paid_by', 'organizer',
      'organizer_id', v_event.organizer_id,
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
    select v_promoter, v_buyer, fl,
           case when fl in ('self_referral', 'organizer_linked', 'same_email', 'same_phone',
                            'same_payment_method') then 'block'
                when public._reward_risk_weight(fl, v_weights) > 0 then 'review'
                else 'info' end,
           jsonb_build_object('event_id', v_tc.event_id, 'checkout_id', p_checkout_id, 'rule', 'promoter_commission'),
           v_id
    from unnest(v_flags) fl;
  end if;

  if v_status in ('pending', 'held') then
    -- Accrual also charges the organizer (live only).
    perform public._reward_accrue(v_id);
    perform public._reward_settle_one(v_id, 'recheck');
  end if;

  return v_id;
end;
$$;

-- Commission figures for the organizer's event page (live only).
create or replace function public.promoter_commission_event_stats(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select e.status, e.amount_minor, e.released_minor, e.beneficiary_user_id,
           (e.basis ->> 'ticket_revenue_minor')::bigint as revenue_minor
    from public.reward_event e
    where e.event_id = p_event_id
      and e.rule_key = 'promoter_commission'
      and not e.is_shadow
      and e.status in ('pending', 'held', 'deferred', 'released', 'clawed_back')
  )
  select jsonb_build_object(
    'sales', (select count(*) from r where r.status <> 'clawed_back'),
    'promoters', (select count(distinct r.beneficiary_user_id) from r where r.status <> 'clawed_back'),
    'revenue_minor', coalesce((select sum(r.revenue_minor) from r where r.status <> 'clawed_back'), 0),
    'pending_minor', coalesce((select sum(r.amount_minor) from r where r.status in ('pending', 'held', 'deferred')), 0),
    'paid_minor', coalesce((select sum(r.released_minor) from r where r.status = 'released'), 0)
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Verified place visits
-- ---------------------------------------------------------------------

create or replace function public._place_visit_code_at(p_place_id uuid, p_window bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select upper(left(encode(extensions.hmac(
           convert_to(p_place_id::text || ':' || p_window::text, 'UTF8'), k.secret, 'sha256'), 'hex'), 10))
  from public.place_visit_key k
  where k.place_id = p_place_id;
$$;

-- The code the owner shows right now. Changes every 30 seconds; the
-- previous one is still accepted, so a scan never races the refresh.
create or replace function public.place_visit_code(p_place_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window bigint := floor(extract(epoch from now()) / 30)::bigint;
begin
  insert into public.place_visit_key (place_id) values (p_place_id)
  on conflict (place_id) do nothing;
  return jsonb_build_object(
    'code', public._place_visit_code_at(p_place_id, v_window),
    'expires_at', to_timestamp((v_window + 1) * 30),
    'period_seconds', 30);
end;
$$;

create or replace function public.place_visit_record(
  p_user_id uuid, p_place_id uuid, p_code text,
  p_lat double precision, p_lng double precision, p_accuracy_m integer,
  p_platform text, p_install_id text, p_mocked boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule     public.reward_rule;
  v_place    record;
  v_window   bigint := floor(extract(epoch from now()) / 30)::bigint;
  v_code     text := upper(trim(coalesce(p_code, '')));
  v_radius   integer;
  v_distance integer;
  v_id       uuid;
begin
  select * into v_rule from public.reward_rule where rule_key = 'place_visits' and is_active;
  if not found then
    return jsonb_build_object('result', 'off');
  end if;

  select p.id, p.name, p.owner_id, p.status, p.moderation_state, p.location
    into v_place
  from public.place p where p.id = p_place_id;
  if not found or v_place.status <> 'published'
     or coalesce(v_place.moderation_state, 'visible') in ('hidden', 'removed') then
    return jsonb_build_object('result', 'place_unavailable');
  end if;
  if v_place.owner_id = p_user_id then
    return jsonb_build_object('result', 'own_place', 'place_name', v_place.name);
  end if;

  if length(v_code) <> 10
     or v_code is distinct from coalesce(public._place_visit_code_at(p_place_id, v_window), '-')
        and v_code is distinct from coalesce(public._place_visit_code_at(p_place_id, v_window - 1), '-') then
    return jsonb_build_object('result', 'invalid_code', 'place_name', v_place.name);
  end if;

  if coalesce(p_mocked, false) then
    return jsonb_build_object('result', 'mocked_location', 'place_name', v_place.name);
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return jsonb_build_object('result', 'no_location', 'place_name', v_place.name);
  end if;
  if coalesce(p_accuracy_m, 0) > 1000 then
    return jsonb_build_object('result', 'poor_location', 'place_name', v_place.name);
  end if;

  v_radius := coalesce((v_rule.caps ->> 'radius_m')::integer, 150);
  v_distance := round(extensions.st_distance(
    v_place.location,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography))::integer;
  -- GPS is rarely exact indoors: allow up to 100 m of the reported accuracy.
  if v_distance > v_radius + least(greatest(coalesce(p_accuracy_m, 0), 0), 100) then
    return jsonb_build_object('result', 'too_far', 'place_name', v_place.name, 'distance_m', v_distance);
  end if;

  insert into public.place_visit (place_id, user_id, visited_on, distance_m, accuracy_m, platform, install_id)
  values (p_place_id, p_user_id, (now() at time zone 'Africa/Accra')::date, v_distance,
          p_accuracy_m, p_platform, nullif(left(coalesce(p_install_id, ''), 100), ''))
  on conflict (place_id, user_id, visited_on) do nothing
  returning id into v_id;

  return jsonb_build_object(
    'result', case when v_id is null then 'already_today' else 'recorded' end,
    'place_name', v_place.name,
    'distance_m', v_distance);
end;
$$;

-- Visit figures for the owner's place page.
create or replace function public.place_visit_stats(p_place_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select v.user_id, v.visited_on
    from public.place_visit v
    where v.place_id = p_place_id
      and v.visited_on >= (date_trunc('month', now() at time zone 'Africa/Accra') - interval '1 month')::date
  ),
  bounds as (
    select (now() at time zone 'Africa/Accra')::date as today,
           date_trunc('month', now() at time zone 'Africa/Accra')::date as month_start
  )
  select jsonb_build_object(
    'today', (select count(*) from v, bounds b where v.visited_on = b.today),
    'this_month_visits', (select count(*) from v, bounds b where v.visited_on >= b.month_start),
    'this_month_visitors', (select count(distinct v.user_id) from v, bounds b where v.visited_on >= b.month_start),
    'last_month_visitors', (select count(distinct v.user_id) from v, bounds b where v.visited_on < b.month_start),
    'earned_minor', coalesce((
      select sum(e.released_minor) from public.reward_event e
      where e.source_id = p_place_id and e.rule_key = 'place_visits'
        and not e.is_shadow and e.status = 'released'), 0)
  );
$$;

create or replace function public._reward_place_visits_evaluate(p_place_id uuid, p_period date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule      public.reward_rule;
  v_settings  public.reward_program_setting;
  v_place     record;
  v_shadow    boolean;
  v_key       text;
  v_end       date := (p_period + interval '1 month')::date;
  v_min_age   integer;
  v_visitors  integer;
  v_counted   integer;
  v_cap       integer;
  v_amount    bigint;
  v_flags     text[] := '{}';
  v_weights   jsonb;
  v_score     integer := 0;
  v_decision  text := 'auto';
  v_status    text;
  v_reason    text;
  v_id        uuid;
  f           text;
begin
  select * into v_rule from public.reward_rule where rule_key = 'place_visits' and is_active;
  if not found then
    return null;
  end if;

  select p.id, p.name, p.owner_id, p.verified, p.moderation_state into v_place
  from public.place p where p.id = p_place_id;
  -- Only verified places earn.
  if not found or not v_place.verified then
    return null;
  end if;

  select * into v_settings from public.reward_program_setting where id = 1;
  v_weights := coalesce(v_settings.risk_weights, '{}'::jsonb);
  v_shadow := v_settings.shadow_mode or not public.rewards_enabled_for_user(v_place.owner_id);

  v_key := 'place_visits:' || p_place_id || ':' || to_char(p_period, 'YYYY-MM');
  if exists (select 1 from public.reward_event e where e.idempotency_key = v_key) then
    return null;
  end if;
  if v_shadow then
    v_key := v_key || ':shadow';
    if exists (select 1 from public.reward_event e where e.idempotency_key = v_key) then
      return null;
    end if;
  end if;

  v_min_age := coalesce((v_rule.caps ->> 'min_visitor_account_age_hours')::integer, 24);
  select count(distinct v.user_id) into v_visitors
  from public.place_visit v
  where v.place_id = p_place_id and v.visited_on >= p_period and v.visited_on < v_end;
  if coalesce(v_visitors, 0) = 0 then
    return null;
  end if;

  -- Different people with a verified phone, older than a day when they
  -- visited, who aren't the owner or look like the owner.
  select count(distinct v.user_id) into v_counted
  from public.place_visit v
  join auth.users u on u.id = v.user_id and u.phone_confirmed_at is not null
  join public.user_info ui on ui.id = v.user_id
  where v.place_id = p_place_id
    and v.visited_on >= p_period and v.visited_on < v_end
    and v.user_id <> v_place.owner_id
    and ui.created_at <= v.created_at - make_interval(hours => v_min_age)
    and cardinality(public._reward_same_person_flags(v.user_id, v_place.owner_id)) = 0;

  v_cap := coalesce((v_rule.caps ->> 'max_visitors_per_month')::integer, 40);
  v_amount := least(v_counted, v_cap)::bigint * coalesce(v_rule.flat_minor, 0);

  v_reason := case
    when v_place.moderation_state = 'removed' then 'place_removed'
    when v_amount <= 0 then 'no_qualifying_visits'
  end;
  if v_reason is not null then
    v_status := 'rejected';
    v_amount := 0;
  end if;

  if v_amount >= v_settings.dual_approval_threshold_minor then
    v_flags := array_append(v_flags, 'large_rebate');
  end if;
  foreach f in array v_flags loop
    v_score := v_score + public._reward_risk_weight(f, v_weights);
  end loop;
  if v_score >= public._reward_risk_weight('reject_threshold', v_weights) then
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
    idempotency_key, is_shadow, status, decision, amount_minor, basis,
    risk_score, risk_flags, status_reason, release_at
  ) values (
    'place_visits', v_rule.id, v_rule.version, v_place.owner_id, 'place', p_place_id,
    v_key, v_shadow, v_status, v_decision, v_amount,
    jsonb_build_object(
      'period_start', p_period,
      'place_id', p_place_id,
      'place_name', v_place.name,
      'visitors', v_visitors,
      'counted_visitors', v_counted,
      'per_visitor_minor', v_rule.flat_minor,
      'max_visitors', v_cap,
      'computed_minor', v_amount),
    v_score, v_flags, v_reason, now()
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    return null;
  end if;

  if v_status in ('pending', 'held') then
    perform public._reward_accrue(v_id);
    perform public._reward_settle_one(v_id, 'settle');
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Engine: dispatch, outbox trigger, accrue / void / settle
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
    perform public._reward_evaluate_promoter_commission(p_aggregate_id);
    perform public._reward_loyalty_evaluate(p_aggregate_id);
    perform public._reward_friend_qualify_order(p_aggregate_id);
    perform public._reward_friend_qualify_organizer(
      (select tc.event_id from public.ticket_checkout tc where tc.id = p_aggregate_id));
    return;
  end if;

  if p_event_type = 'claim_changed' then
    perform public._reward_friend_qualify_claim(p_aggregate_id);
  end if;

  for v_id in
    select e.id from public.reward_event e
    where e.status in ('pending', 'held', 'deferred', 'released')
      and case
            when p_event_type in ('checkout_cancelled', 'ticket_cancelled', 'claim_changed')
              then e.source_id = p_aggregate_id
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

create or replace function public.reward_emit_ticket_checkout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.status = 'paid' then
    if new.referrer_user_id is not null
       or exists (
         select 1 from public.user_referral ur
         where ur.status = 'bound'
           and (ur.referee_user_id = new.user_id
                or ur.referee_user_id = (select e.organizer_id from public.event e where e.id = new.event_id))
       )
       -- Any paid order can be someone's Nth for the loyalty reward.
       or (new.user_id is not null and new.total_price > 0
           and exists (select 1 from public.reward_rule r
                       where r.rule_key = 'loyalty_fee_rebate' and r.is_active)) then
      insert into public.reward_outbox (event_type, aggregate_id) values ('checkout_paid', new.id);
    end if;
  elsif old.status = 'paid' then
    if new.referrer_user_id is not null
       or exists (select 1 from public.reward_event e where e.source_id = new.id) then
      insert into public.reward_outbox (event_type, aggregate_id) values ('checkout_cancelled', new.id);
    end if;
  end if;
  return null;
end;
$$;

create or replace function public._reward_accrue(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r           public.reward_event;
  v_rule      public.reward_rule;
  v_period    date;
  v_lot       uuid;
  v_label     text;
  v_memo      text;
  v_immediate boolean;
  v_expires   timestamptz;
begin
  select * into r from public.reward_event where id = p_id for update;
  if r.is_shadow or r.lot_id is not null or r.status not in ('pending', 'held', 'deferred') then
    return r.status;
  end if;

  -- A promoter commission is paid by the organizer, not from Abonten's
  -- reward budget.
  if r.rule_key <> 'promoter_commission' then
    v_period := public._reward_commit_budget(r.amount_minor);
    if v_period is null then
      update public.reward_event e
      set status = 'deferred', status_reason = 'budget_exhausted', updated_at = now()
      where e.id = r.id;
      return 'deferred';
    end if;
  end if;

  select * into v_rule from public.reward_rule where id = r.rule_id;
  v_immediate := v_rule.release_policy = 'immediate';

  if r.rule_key in ('event_referral', 'organizer_rebate', 'venue_rebate', 'organizer_milestone',
                    'loyalty_fee_rebate', 'promoter_commission') then
    select e.title into v_label from public.event e where e.id = r.event_id;
  end if;

  if r.rule_key = 'event_referral' then
    v_label := coalesce(v_label, 'Event referral');
    v_memo := 'Event referral reward';
  elsif r.rule_key = 'friend_referral_referrer' then
    v_label := 'inviting ' || public._referral_display_name(r.buyer_user_id);
    v_memo := 'Friend referral reward';
  elsif r.rule_key = 'friend_referral_referee' then
    v_label := format('For your first ticket order of GH₵ %s or more',
                      to_char(v_rule.min_basis_minor / 100.0, 'FM999999990.00'));
    v_memo := 'Welcome credit';
  elsif r.rule_key = 'organizer_rebate' then
    v_label := coalesce(v_label, 'Your event');
    v_memo := 'Organizer rebate';
  elsif r.rule_key = 'venue_rebate' then
    v_label := coalesce(v_label, 'An event') || coalesce(' at ' || (r.basis ->> 'place_name'), ' at your venue');
    v_memo := 'Venue rebate';
  elsif r.rule_key = 'organizer_milestone' then
    v_label := format('%s buyers for %s', r.basis ->> 'unique_buyers', coalesce(v_label, 'your event'));
    v_memo := 'Organizer milestone';
  elsif r.rule_key = 'loyalty_fee_rebate' then
    v_label := 'Service fee back on ' || coalesce(v_label, 'your ticket order');
    v_memo := 'Loyalty fee rebate';
  elsif r.rule_key = 'promoter_commission' then
    v_label := 'Commission on ' || coalesce(v_label, 'a ticket you sold');
    v_memo := 'Promoter commission (paid by the organizer)';
  elsif r.rule_key = 'place_visits' then
    v_label := format('%s verified %s to %s', r.basis ->> 'counted_visitors',
                      case when (r.basis ->> 'counted_visitors') = '1' then 'visitor' else 'visitors' end,
                      coalesce(r.basis ->> 'place_name', 'your place'));
    v_memo := 'Place visits';
  else
    v_label := 'Reward';
    v_memo := r.rule_key;
  end if;

  v_expires := (case when v_immediate then now() else coalesce(r.release_at, now()) end)
               + make_interval(days => coalesce(v_rule.expiry_days, 365));

  select g.lot_id into v_lot
  from public.credit_grant(
    r.beneficiary_user_id, r.amount_minor, 'reward.accrue', v_rule.lot_kind, v_rule.spend_scope,
    'reward.accrue:' || r.id, 'system', null, v_label, v_memo, v_expires,
    case when v_immediate then now() else r.release_at end,
    false, null, 'reward_event', r.id::text, r.id
  ) g;

  if v_immediate then
    perform public.credit_release_lot(v_lot, 'reward.release:' || r.id, r.amount_minor,
                                      'system', null, null);
    update public.reward_budget_period b
    set released_minor = b.released_minor + r.amount_minor, updated_at = now()
    where b.period_start = v_period;
    update public.reward_event e
    set lot_id = v_lot, budget_period = v_period, status = 'released',
        released_minor = r.amount_minor, status_reason = null,
        settled_at = now(), updated_at = now()
    where e.id = r.id;

    if r.rule_key = 'friend_referral_referee' then
      perform public._reward_notify(
        r.beneficiary_user_id, 'welcome_credit', 'You have welcome credit',
        format('GH₵ %s off your first ticket order of GH₵ %s or more. Use it within %s days.',
               to_char(r.amount_minor / 100.0, 'FM999999990.00'),
               to_char(v_rule.min_basis_minor / 100.0, 'FM999999990.00'),
               coalesce(v_rule.expiry_days, 30)));
    end if;
    return 'released';
  end if;

  update public.reward_event e
  set lot_id = v_lot, budget_period = v_period,
      status = case when r.decision = 'review' then 'held' else 'pending' end,
      status_reason = case when r.decision = 'review' then 'risk_review' else null end,
      updated_at = now()
  where e.id = r.id;

  -- Charged to the organizer now, so it can never be paid out first.
  if r.rule_key = 'promoter_commission' then
    perform public._promoter_commission_post(r.id, -r.amount_minor);
  end if;

  return case when r.decision = 'review' then 'held' else 'pending' end;
end;
$$;

create or replace function public._reward_void(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        public.reward_event;
  v_window integer;
begin
  select * into r from public.reward_event where id = p_id for update;
  if r.status not in ('pending', 'held', 'deferred') then
    return;
  end if;

  if not r.is_shadow and r.lot_id is not null then
    perform public.credit_void_lot(r.lot_id, 'reward.void:' || r.id, 'system', null, p_reason);
    -- The organizer gets the commission back.
    if r.rule_key = 'promoter_commission' then
      perform public._promoter_commission_post(r.id, r.amount_minor);
    end if;
  end if;
  if not r.is_shadow and r.budget_period is not null then
    update public.reward_budget_period b
    set committed_minor = greatest(b.committed_minor - r.amount_minor, 0), updated_at = now()
    where b.period_start = r.budget_period;
  end if;

  update public.reward_event e
  set status = 'voided', status_reason = p_reason, settled_at = now(), updated_at = now()
  where e.id = r.id;

  -- The friend's qualifying order didn't hold: they can still qualify with
  -- another one while the window is open. A review rejection is final.
  if r.rule_key = 'friend_referral_referrer' then
    select coalesce((x.caps ->> 'qualify_within_days')::integer, 60) into v_window
    from public.reward_rule x where x.id = r.rule_id;
    update public.user_referral ur
    set status = case
                   when p_reason = 'rejected_by_review' then 'rejected'
                   when (select u.created_at from public.user_info u where u.id = ur.referee_user_id)
                        < now() - make_interval(days => coalesce(v_window, 60)) then 'expired'
                   else 'bound'
                 end,
        qualified_via   = case when p_reason = 'rejected_by_review' then ur.qualified_via end,
        qualified_at    = case when p_reason = 'rejected_by_review' then ur.qualified_at end,
        reward_event_id = case when p_reason = 'rejected_by_review' then ur.reward_event_id end,
        updated_at      = now()
    where ur.reward_event_id = r.id;
  end if;

  if not r.is_shadow and r.notified_pending_at is not null then
    perform public._reward_notify(
      r.beneficiary_user_id, 'reward_reversed', 'A pending reward was removed',
      case
        when r.rule_key = 'friend_referral_referrer' then
          case p_reason
            when 'refunded' then 'Your friend''s order was refunded, so the pending invite reward was removed.'
            when 'cancelled' then 'Your friend''s tickets were cancelled, so the pending invite reward was removed.'
            when 'event_cancelled' then 'The event was cancelled, so the pending invite reward was removed.'
            else 'A pending invite reward was removed after a review.'
          end
        when r.rule_key = 'loyalty_fee_rebate' then
          case p_reason
            when 'event_cancelled' then 'The event was cancelled, so the service fee credit for that order was removed.'
            when 'refunded' then 'That order was refunded, so its service fee credit was removed. Your next order can earn it again.'
            when 'cancelled' then 'Those tickets were cancelled, so their service fee credit was removed. Your next order can earn it again.'
            else 'A pending service fee credit was removed after a review of the order.'
          end
        when r.rule_key = 'promoter_commission' then
          case p_reason
            when 'refunded' then 'A ticket you sold was refunded, so its pending commission was removed.'
            when 'cancelled' then 'A ticket you sold was cancelled, so its pending commission was removed.'
            when 'event_cancelled' then 'An event you promoted was cancelled, so its pending commission was removed.'
            else 'A pending commission was removed after a review of the sale.'
          end
        else
          case p_reason
            when 'refunded' then 'A ticket you referred was refunded, so its pending reward was removed.'
            when 'cancelled' then 'A ticket you referred was cancelled, so its pending reward was removed.'
            when 'event_cancelled' then 'An event you shared was cancelled, so its pending reward was removed.'
            else 'A pending reward was removed after a review of the sale.'
          end
      end);
  end if;
end;
$$;

create or replace function public._reward_settle_one(p_id uuid, p_mode text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r              public.reward_event;
  v_event_status text;
  v_event_mod    text;
  v_event_place  uuid;
  v_txn_status   text;
  v_tc_id        uuid;
  v_tc_status    text;
  v_units_total  integer := 0;
  v_units_valid  integer := 0;
  v_claim_status text;
  v_claimant     uuid;
  v_place_owner  uuid;
  v_place_ok     boolean;
  v_place_mod    text;
  v_friend       boolean;
  v_threshold    integer;
  v_dead         text;
  v_suspect      text;
  v_release      bigint;
begin
  select * into r from public.reward_event where id = p_id for update;
  if not found or r.status not in ('pending', 'held', 'deferred', 'released') then
    return r.status;
  end if;

  -- Welcome credit is granted and released in one step; nothing to re-check.
  if r.source_type = 'user_referral' then
    return r.status;
  end if;

  v_friend := r.rule_key = 'friend_referral_referrer';

  if r.event_id is not null then
    select e.status, e.moderation_state, e.place_id into v_event_status, v_event_mod, v_event_place
    from public.event e where e.id = r.event_id;
  end if;
  if r.transaction_id is not null then
    select t.status into v_txn_status from public.transaction t where t.id = r.transaction_id;
  end if;

  if r.source_type = 'ticket_checkout' then
    select tc.id, tc.status into v_tc_id, v_tc_status
    from public.ticket_checkout tc where tc.id = r.source_id;
    select count(*), count(*) filter (where t.status <> 'cancelled')
      into v_units_total, v_units_valid
    from public.ticket t where t.ticket_checkout_id = r.source_id;
    v_dead := case
      when v_tc_id is null then 'source_missing'
      when v_event_status = 'canceled' then 'event_cancelled'
      when v_txn_status in ('refund_pending', 'refunded') then 'refunded'
      when v_tc_status <> 'paid' or v_units_valid = 0 then 'cancelled'
      when v_event_mod = 'removed' then 'event_removed'
    end;
  elsif r.source_type = 'event' then
    if r.rule_key = 'venue_rebate' then
      -- Still a verified place, still owned by who the rebate is for.
      select p.verified and p.owner_id = r.beneficiary_user_id, p.moderation_state
        into v_place_ok, v_place_mod
      from public.place p where p.id = v_event_place;
    end if;
    v_dead := case
      when v_event_status is null then 'source_missing'
      when v_event_status = 'canceled' then 'event_cancelled'
      when v_event_mod = 'removed' then 'event_removed'
      when r.rule_key = 'venue_rebate' and not coalesce(v_place_ok, false) then 'venue_changed'
      when v_place_mod = 'removed' then 'place_removed'
    end;
  elsif r.source_type = 'place' then
    select p.verified and p.owner_id = r.beneficiary_user_id, p.moderation_state
      into v_place_ok, v_place_mod
    from public.place p where p.id = r.source_id;
    v_dead := case
      when v_place_ok is null then 'source_missing'
      when not v_place_ok then 'venue_changed'
      when v_place_mod = 'removed' then 'place_removed'
    end;
  elsif r.source_type = 'place_claim' then
    select c.status, c.claimant_id, p.owner_id, p.moderation_state
      into v_claim_status, v_claimant, v_place_owner, v_place_mod
    from public.place_claim_request c
    left join public.place p on p.id = c.place_id
    where c.id = r.source_id;
    v_dead := case
      when v_claim_status is null then 'source_missing'
      when v_claim_status <> 'approved' or v_place_owner is distinct from v_claimant then 'claim_revoked'
      when v_place_mod = 'removed' then 'place_removed'
    end;
  end if;

  v_suspect := case
    when r.transaction_id is not null and exists (
      select 1 from public.payment_dispute d
      where d.transaction_id = r.transaction_id and d.resolved_at is null) then 'open_dispute'
    when v_event_mod = 'hidden' then 'event_hidden'
    when v_place_mod = 'hidden' then 'place_hidden'
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
          null, 'Chargeback on the sale', 'reward_event', r.id::text, r.id);
        -- The promoter no longer gets it, so the organizer gets it back.
        if r.rule_key = 'promoter_commission' then
          perform public._promoter_commission_post(r.id, r.released_minor);
        end if;
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

  -- Live credit only unlocks for a beneficiary with a verified phone number
  -- -- and for an invite, a friend with one too. Wait (checking daily) up to
  -- 90 days, then give up on it.
  if not r.is_shadow and (
       not exists (select 1 from auth.users u
                   where u.id = r.beneficiary_user_id and u.phone_confirmed_at is not null)
       or (v_friend and not exists (select 1 from auth.users u
                                    where u.id = r.buyer_user_id and u.phone_confirmed_at is not null))
     ) then
    if r.release_at < now() - interval '90 days' then
      perform public._reward_void(
        r.id,
        case when exists (select 1 from auth.users u
                          where u.id = r.beneficiary_user_id and u.phone_confirmed_at is not null)
             then 'friend_phone_not_verified' else 'phone_not_verified' end);
      return 'voided';
    end if;
    update public.reward_event e
    set next_check_at = now() + interval '1 day',
        status_reason = case when exists (select 1 from auth.users u
                                          where u.id = r.beneficiary_user_id and u.phone_confirmed_at is not null)
                             then 'friend_phone_not_verified' else 'phone_not_verified' end,
        updated_at = now()
    where e.id = r.id;
    return 'pending';
  end if;

  if r.rule_key in ('event_referral', 'loyalty_fee_rebate', 'promoter_commission') then
    -- Tickets cancelled since the sale: only the ones still valid count.
    v_release := floor(r.amount_minor * v_units_valid::numeric / greatest(v_units_total, 1))::bigint;
  elsif v_friend and r.source_type = 'event' then
    -- Invite path (2): the buyers still have to be there at settlement.
    select coalesce((x.caps ->> 'organizer_unique_buyers')::integer, 10) into v_threshold
    from public.reward_rule x where x.id = r.rule_id;
    if public._reward_event_unique_buyers(r.event_id, r.buyer_user_id) < coalesce(v_threshold, 10) then
      perform public._reward_void(r.id, 'not_enough_buyers');
      return 'voided';
    end if;
    v_release := r.amount_minor;
  else
    v_release := r.amount_minor;
  end if;

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
    -- The organizer keeps the commission on cancelled tickets.
    if r.rule_key = 'promoter_commission' and v_release < r.amount_minor then
      perform public._promoter_commission_post(r.id, r.amount_minor - v_release);
    end if;
  end if;

  update public.reward_event e
  set status = 'released', released_minor = v_release, status_reason = null,
      next_check_at = null, settled_at = now(), updated_at = now()
  where e.id = r.id;

  if v_friend then
    update public.user_referral ur set status = 'rewarded', updated_at = now()
    where ur.reward_event_id = r.id;
  end if;
  return 'released';
end;
$$;

-- Pending-reward digests: one message per person, never one per sale.
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
    select e.beneficiary_user_id as user_id, e.rule_key, sum(e.amount_minor) as amount_minor,
           count(*) as n, array_agg(e.id) as ids
    from public.reward_event e
    where not e.is_shadow and e.status = 'pending' and e.notified_pending_at is null
      and e.rule_key in ('event_referral', 'promoter_commission')
    group by e.beneficiary_user_id, e.rule_key
  loop
    if rec.rule_key = 'promoter_commission' then
      perform public._reward_notify(
        rec.user_id, 'commission_pending', 'You sold tickets as a promoter',
        format('GH₵ %s in commission is pending from %s %s sold through your link. The organizer pays it as credit after the %s.',
               to_char(rec.amount_minor / 100.0, 'FM999999990.00'), rec.n,
               case when rec.n = 1 then 'ticket order' else 'ticket orders' end,
               case when rec.n = 1 then 'event' else 'events' end));
    else
      perform public._reward_notify(
        rec.user_id, 'reward_pending', 'You have a reward on the way',
        format('GH₵ %s is pending from %s referred %s. It unlocks after the %s.',
               to_char(rec.amount_minor / 100.0, 'FM999999990.00'), rec.n,
               case when rec.n = 1 then 'ticket' else 'tickets' end,
               case when rec.n = 1 then 'event' else 'events' end));
    end if;
    update public.reward_event e set notified_pending_at = now() where e.id = any (rec.ids);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Monthly run: + place visits (only once the month is over)
-- ---------------------------------------------------------------------

create or replace function public.rewards_run_monthly_rebates(
  p_period_start date default null, p_triggered_by uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period    date := coalesce(p_period_start, (date_trunc('month', now()) - interval '1 month')::date);
  v_end       timestamptz;
  v_settings  public.reward_program_setting;
  v_run       uuid;
  v_ids       uuid[] := '{}';
  v_id        uuid;
  v_events    integer := 0;
  v_places    integer := 0;
  v_errors    integer := 0;
  v_last_err  text;
  v_stats     jsonb;
  v_event_id  uuid;
  v_place_id  uuid;
  v_month_over boolean;
  rec         record;
begin
  if extract(day from v_period) <> 1 then
    raise exception 'A period starts on the first day of a month' using errcode = '22023';
  end if;
  if v_period > now()::date then
    raise exception 'That month hasn''t started yet' using errcode = '22023';
  end if;

  -- One run at a time.
  perform pg_advisory_xact_lock(hashtext('rewards_run_monthly_rebates'));

  v_end := least((v_period + interval '1 month')::timestamptz, now());
  v_month_over := (v_period + interval '1 month')::timestamptz <= now();
  select * into v_settings from public.reward_program_setting where id = 1;
  insert into public.reward_rebate_run (period_start, triggered_by, shadow_mode)
  values (v_period, p_triggered_by, v_settings.shadow_mode)
  returning id into v_run;

  if not exists (select 1 from public.reward_rule r
                 where r.is_active
                   and r.rule_key in ('organizer_rebate', 'venue_rebate', 'organizer_milestone', 'place_visits')) then
    v_stats := jsonb_build_object('skipped', 'no_live_rules', 'events', 0);
    update public.reward_rebate_run
    set finished_at = now(), stats = v_stats where id = v_run;
    return v_stats || jsonb_build_object('run_id', v_run, 'period_start', v_period);
  end if;

  for v_event_id in
    select e.id
    from public.event e
    where e.status in ('published', 'completed')
      and e.id in (select tc.event_id from public.ticket_checkout tc
                   where tc.status = 'paid' and tc.total_price > 0)
      and public._event_settles_at(e.id) >= v_period
      and public._event_settles_at(e.id) < v_end
    order by public._event_settles_at(e.id), e.id
  loop
    v_events := v_events + 1;
    begin
      v_id := public._reward_rebate_evaluate('organizer_rebate', v_event_id, v_period);
      if v_id is not null then v_ids := v_ids || v_id; end if;
      v_id := public._reward_rebate_evaluate('venue_rebate', v_event_id, v_period);
      if v_id is not null then v_ids := v_ids || v_id; end if;
      v_id := public._reward_milestone_evaluate(v_event_id, v_period);
      if v_id is not null then v_ids := v_ids || v_id; end if;
    exception when others then
      v_errors := v_errors + 1;
      v_last_err := format('event %s: %s', v_event_id, left(sqlerrm, 300));
      raise warning 'monthly rebate for event % failed: %', v_event_id, sqlerrm;
    end;
  end loop;

  -- A visits reward counts the whole month, so it's decided only after it.
  if v_month_over then
    for v_place_id in
      select distinct v.place_id
      from public.place_visit v
      join public.place p on p.id = v.place_id and p.verified
      where v.visited_on >= v_period and v.visited_on < (v_period + interval '1 month')::date
      order by v.place_id
    loop
      v_places := v_places + 1;
      begin
        v_id := public._reward_place_visits_evaluate(v_place_id, v_period);
        if v_id is not null then v_ids := v_ids || v_id; end if;
      exception when others then
        v_errors := v_errors + 1;
        v_last_err := format('place %s: %s', v_place_id, left(sqlerrm, 300));
        raise warning 'monthly visits reward for place % failed: %', v_place_id, sqlerrm;
      end;
    end loop;
  end if;

  -- One notification per person for what was released now (live only).
  for rec in
    select e.beneficiary_user_id as user_id,
           sum(e.released_minor) filter (where e.rule_key in ('organizer_rebate', 'venue_rebate')) as rebate_minor,
           sum(e.released_minor) filter (where e.rule_key = 'organizer_milestone') as milestone_minor,
           max(e.basis ->> 'unique_buyers') filter (where e.rule_key = 'organizer_milestone') as buyers,
           sum(e.released_minor) filter (where e.rule_key = 'place_visits') as visits_minor,
           sum((e.basis ->> 'counted_visitors')::integer) filter (where e.rule_key = 'place_visits') as visitors
    from public.reward_event e
    where e.id = any (v_ids) and not e.is_shadow and e.status = 'released'
    group by e.beneficiary_user_id
  loop
    if coalesce(rec.rebate_minor, 0) > 0 then
      perform public._reward_notify(
        rec.user_id, 'promotion_credit_earned', 'You earned promotion credit',
        format('GH₵ %s of promotion credit from events that ended in %s. Use it to feature an event or place.',
               to_char(rec.rebate_minor / 100.0, 'FM999999990.00'), trim(to_char(v_period, 'Month'))));
    end if;
    if coalesce(rec.milestone_minor, 0) > 0 then
      perform public._reward_notify(
        rec.user_id, 'milestone_reached', format('%s people bought tickets to your event', rec.buyers),
        format('Here''s GH₵ %s of promotion credit to feature your next event.',
               to_char(rec.milestone_minor / 100.0, 'FM999999990.00')));
    end if;
    if coalesce(rec.visits_minor, 0) > 0 then
      perform public._reward_notify(
        rec.user_id, 'promotion_credit_earned', 'Visitors earned you promotion credit',
        format('%s verified %s checked in at your place in %s. Here''s GH₵ %s of promotion credit to feature it.',
               rec.visitors, case when rec.visitors = 1 then 'visitor' else 'visitors' end,
               trim(to_char(v_period, 'Month')), to_char(rec.visits_minor / 100.0, 'FM999999990.00')));
    end if;
  end loop;

  select jsonb_build_object(
    'events', v_events,
    'places', v_places,
    'visits_decided', v_month_over,
    'errors', v_errors,
    'rewards', coalesce(jsonb_object_agg(x.rule_key, x.detail), '{}'::jsonb))
    into v_stats
  from (
    select e.rule_key,
           jsonb_build_object(
             'decided', count(*),
             'released', count(*) filter (where e.status = 'released'),
             'held', count(*) filter (where e.status in ('held', 'pending', 'deferred')),
             'rejected', count(*) filter (where e.status = 'rejected'),
             'shadow', count(*) filter (where e.is_shadow),
             'amount_minor', coalesce(sum(case when e.status = 'released' then e.released_minor
                                                else e.amount_minor end), 0)) as detail
    from public.reward_event e
    where e.id = any (v_ids)
    group by e.rule_key
  ) x;
  if v_last_err is not null then
    v_stats := v_stats || jsonb_build_object('last_error', v_last_err);
  end if;

  update public.reward_rebate_run
  set finished_at = now(), stats = v_stats where id = v_run;

  if v_errors > 0 then
    perform public.open_reconciliation_incident(
      'rewards.rebate_run',
      'Monthly rebates: some events failed',
      format('The rebate run for %s failed on %s event(s) or place(s). Last error: %s. Fix the cause, then run the month again from Admin › Rewards › Rebates (decided ones are skipped).',
             to_char(v_period, 'YYYY-MM'), v_errors, v_last_err),
      'medium');
  end if;

  return v_stats || jsonb_build_object('run_id', v_run, 'period_start', v_period);
end;
$$;

create or replace function public.rebate_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select e.rule_key, e.status, e.amount_minor, e.released_minor, e.basis, e.created_at,
           coalesce(ev.title, e.basis ->> 'place_name') as event_title
    from public.reward_event e
    left join public.event ev on ev.id = e.event_id
    where e.beneficiary_user_id = p_user_id
      and e.rule_key in ('organizer_rebate', 'venue_rebate', 'organizer_milestone', 'place_visits')
      and not e.is_shadow
      and e.status in ('pending', 'held', 'deferred', 'released')
  ),
  last_period as (
    select (r.basis ->> 'period_start')::date as period_start, sum(r.released_minor) as amount_minor
    from r
    where r.status = 'released' and r.rule_key in ('organizer_rebate', 'venue_rebate', 'place_visits')
    group by 1
    order by 1 desc
    limit 1
  )
  select jsonb_build_object(
    'pending_minor', coalesce((select sum(r.amount_minor) from r where r.status <> 'released'), 0),
    'earned_minor', coalesce((select sum(r.released_minor) from r where r.status = 'released'), 0),
    'promotion_only_minor', coalesce((
      select sum(l.remaining_minor - l.held_minor)
      from public.credit_lot l
      where l.user_id = p_user_id and l.status = 'active' and l.spend_scope = 'promotions'
        and (l.expires_at is null or l.expires_at > now())), 0),
    'last', (select jsonb_build_object('period_start', lp.period_start, 'amount_minor', lp.amount_minor)
             from last_period lp),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', case x.rule_key when 'organizer_rebate' then 'organizer'
                                       when 'venue_rebate' then 'venue'
                                       when 'place_visits' then 'visits'
                                       else 'milestone' end,
               'event_title', x.event_title,
               'amount_minor', case when x.status = 'released' then x.released_minor else x.amount_minor end,
               'status', case when x.status = 'released' then 'earned' else 'pending' end,
               'period_start', x.basis ->> 'period_start',
               'at', x.created_at) order by x.created_at desc)
      from (select * from r order by r.created_at desc limit 10) x), '[]'::jsonb)
  );
$$;

create or replace function public.get_rewards_program_public()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select * from public.reward_program_setting where id = 1
  ),
  r as (
    select rule_key, rate_bps, net_share_cap_bps, flat_minor, min_basis_minor,
           expiry_days, release_policy, caps
    from public.reward_rule
    where is_active
  )
  select jsonb_build_object(
    'enabled', public.rewards_enabled_for_user(auth.uid()),
    'event_referral', (
      select jsonb_build_object('rate_bps', rate_bps, 'min_order_minor', min_basis_minor,
                                'expiry_days', expiry_days)
      from r where rule_key = 'event_referral'),
    'friend_referral', (
      select jsonb_build_object(
        'referrer_minor', (select flat_minor from r where rule_key = 'friend_referral_referrer'),
        'referee_minor', (select flat_minor from r where rule_key = 'friend_referral_referee'),
        'min_order_minor', (select min_basis_minor from r where rule_key = 'friend_referral_referrer'),
        'welcome_expiry_days', (select expiry_days from r where rule_key = 'friend_referral_referee'))
      where exists (select 1 from r where rule_key = 'friend_referral_referrer')),
    'organizer_rebate', (
      select jsonb_build_object('net_share_bps', net_share_cap_bps, 'expiry_days', expiry_days)
      from r where rule_key = 'organizer_rebate'),
    'venue_rebate', (
      select jsonb_build_object('net_share_bps', net_share_cap_bps, 'expiry_days', expiry_days)
      from r where rule_key = 'venue_rebate'),
    'organizer_milestone', (
      select jsonb_build_object('amount_minor', flat_minor,
                                'unique_buyers', coalesce((caps ->> 'unique_paid_attendees')::integer, 50),
                                'expiry_days', expiry_days)
      from r where rule_key = 'organizer_milestone'),
    'loyalty_fee_rebate', (
      select jsonb_build_object('orders_required', greatest(coalesce((caps ->> 'orders_required')::integer, 5), 2),
                                'window_days', coalesce((caps ->> 'window_days')::integer, 90),
                                'max_minor', coalesce((caps ->> 'max_per_reward_minor')::bigint, 1000),
                                'fee_share_bps', rate_bps,
                                'min_order_minor', min_basis_minor,
                                'expiry_days', expiry_days)
      from r where rule_key = 'loyalty_fee_rebate'),
    -- Commissions ride on referral links, so they're only offered while
    -- link capture is on.
    'promoter_commission', (
      select jsonb_build_object('min_rate_bps', coalesce((caps ->> 'min_rate_bps')::integer, 100),
                                'max_rate_bps', coalesce((caps ->> 'max_rate_bps')::integer, 3000),
                                'expiry_days', expiry_days)
      from r where rule_key = 'promoter_commission' and s.referral_capture_enabled),
    'place_visits', (
      select jsonb_build_object('per_visitor_minor', flat_minor,
                                'max_visitors', coalesce((caps ->> 'max_visitors_per_month')::integer, 40),
                                'radius_m', coalesce((caps ->> 'radius_m')::integer, 150),
                                'expiry_days', expiry_days)
      from r where rule_key = 'place_visits'),
    'redemption', jsonb_build_object(
      'tickets', s.redeem_tickets_enabled,
      'promotions', s.redeem_promotions_enabled,
      'allow_full_credit_ticket_orders', s.allow_full_credit_ticket_orders,
      'min_cash_charge_minor', s.min_cash_charge_minor),
    'withdrawals', jsonb_build_object(
      'enabled', s.withdrawals_enabled,
      'min_minor', s.withdrawal_min_minor)
  )
  from s;
$$;

-- ---------------------------------------------------------------------
-- Organizer finance: a commission is part of the event's earnings, so it
-- is pending until the event settles and then comes off the payable
-- balance (same rule as refunds).
-- ---------------------------------------------------------------------

create or replace function public.get_organizer_finance_overview()
returns table(currency text, pending_balance numeric, available_balance numeric, total_earnings numeric)
language plpgsql
set search_path = ''
as $$
BEGIN
  RETURN QUERY
  WITH earning_rows AS (
    SELECT
      le.currency::text AS cur,
      le.amount         AS amt,
      public.is_event_settled(le.event_id) AS settled
    FROM public.organizer_ledger_entry le
    WHERE le.organizer_id = auth.uid()
      AND le.entry_type IN ('earning', 'refund_adjustment', 'refund_hold', 'refund_release',
                            'promoter_commission', 'promoter_commission_reversal')
  ),
  earning_totals AS (
    SELECT
      er.cur,
      COALESCE(SUM(er.amt) FILTER (WHERE NOT er.settled), 0) AS pending,
      COALESCE(SUM(er.amt) FILTER (WHERE er.settled), 0)     AS settled_net,
      COALESCE(SUM(er.amt), 0)                               AS total
    FROM earning_rows er
    GROUP BY er.cur
  ),
  payout_totals AS (
    SELECT le.currency::text AS cur, COALESCE(SUM(le.amount), 0) AS net
    FROM public.organizer_ledger_entry le
    WHERE le.organizer_id = auth.uid()
      AND le.entry_type IN ('payout_hold', 'payout_release')
    GROUP BY le.currency::text
  ),
  currencies AS (
    SELECT cur FROM earning_totals
    UNION
    SELECT cur FROM payout_totals
  )
  SELECT
    c.cur,
    COALESCE(et.pending, 0)::numeric,
    (COALESCE(et.settled_net, 0) + COALESCE(pt.net, 0))::numeric,
    COALESCE(et.total, 0)::numeric
  FROM currencies c
  LEFT JOIN earning_totals et ON et.cur = c.cur
  LEFT JOIN payout_totals pt ON pt.cur = c.cur;
END;
$$;

create or replace function public.get_organizer_pending_earnings()
returns table(event_id uuid, event_title text, currency text, amount numeric)
language plpgsql
set search_path = ''
as $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.title,
    le.currency::text,
    SUM(le.amount)
  FROM public.organizer_ledger_entry le
  JOIN public.event e ON e.id = le.event_id
  WHERE le.organizer_id = auth.uid()
    AND le.entry_type IN ('earning', 'refund_adjustment', 'refund_hold', 'refund_release',
                          'promoter_commission', 'promoter_commission_reversal')
    AND NOT public.is_event_settled(le.event_id)
  GROUP BY e.id, e.title, le.currency
  HAVING SUM(le.amount) <> 0
  ORDER BY SUM(le.amount) DESC;
END;
$$;

create or replace function public.request_organizer_payout(p_payout_account_id uuid, p_amount numeric, p_currency text)
returns table(payout_id uuid, reference text)
language plpgsql
security definer
set search_path = ''
as $$
DECLARE
  v_organizer_id   uuid := auth.uid();
  v_available      numeric;
  v_account_owner  uuid;
  v_account_status text;
  v_payout_id      uuid;
  v_reference      text;
BEGIN
  IF v_organizer_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid payout amount';
  END IF;

  SELECT organizer_id, status INTO v_account_owner, v_account_status
  FROM public.payout_account
  WHERE id = p_payout_account_id;

  IF v_account_owner IS NULL OR v_account_owner <> v_organizer_id OR v_account_status <> 'active' THEN
    RAISE EXCEPTION 'Invalid payout account';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_organizer_id::text || ':' || p_currency, 0));

  SELECT
    COALESCE(SUM(le.amount) FILTER (
      WHERE le.entry_type IN ('earning', 'refund_adjustment', 'refund_hold', 'refund_release',
                              'promoter_commission', 'promoter_commission_reversal')
        AND public.is_event_settled(le.event_id)
    ), 0)
    + COALESCE(SUM(le.amount) FILTER (WHERE le.entry_type IN ('payout_hold', 'payout_release')), 0)
  INTO v_available
  FROM public.organizer_ledger_entry le
  WHERE le.organizer_id = v_organizer_id AND le.currency = p_currency;

  IF p_amount > v_available THEN
    RAISE EXCEPTION 'Payout amount exceeds available balance';
  END IF;

  v_reference := 'PYT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.payout (organizer_id, payout_account_id, amount, currency, reference)
  VALUES (v_organizer_id, p_payout_account_id, p_amount, p_currency, v_reference)
  RETURNING id INTO v_payout_id;

  INSERT INTO public.organizer_ledger_entry (organizer_id, payout_id, entry_type, amount, currency)
  VALUES (v_organizer_id, v_payout_id, 'payout_hold', -1 * p_amount, p_currency);

  RETURN QUERY SELECT v_payout_id, v_reference;
END;
$$;

create or replace function public.admin_create_payout(p_organizer_id uuid, p_payout_account_id uuid, p_amount numeric, p_currency text)
returns table(payout_id uuid, reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_available     numeric;
  v_account_owner uuid;
  v_account_status text;
  v_payout_id     uuid;
  v_reference     text;
begin
  if p_organizer_id is null then
    raise exception 'Organizer id is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid payout amount';
  end if;

  select organizer_id, status into v_account_owner, v_account_status
  from public.payout_account
  where id = p_payout_account_id;

  if v_account_owner is null or v_account_owner <> p_organizer_id or v_account_status <> 'active' then
    raise exception 'Invalid payout account';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organizer_id::text || ':' || p_currency, 0));

  select
    coalesce(sum(le.amount) filter (
      where le.entry_type in ('earning', 'refund_adjustment', 'refund_hold', 'refund_release',
                              'promoter_commission', 'promoter_commission_reversal')
        and public.is_event_settled(le.event_id)
    ), 0)
    + coalesce(sum(le.amount) filter (where le.entry_type in ('payout_hold', 'payout_release')), 0)
  into v_available
  from public.organizer_ledger_entry le
  where le.organizer_id = p_organizer_id and le.currency = p_currency;

  if p_amount > v_available then
    raise exception 'Payout amount exceeds available balance';
  end if;

  v_reference := 'PYT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.payout (organizer_id, payout_account_id, amount, currency, reference)
  values (p_organizer_id, p_payout_account_id, p_amount, p_currency, v_reference)
  returning id into v_payout_id;

  insert into public.organizer_ledger_entry (organizer_id, payout_id, entry_type, amount, currency)
  values (p_organizer_id, v_payout_id, 'payout_hold', -1 * p_amount, p_currency);

  return query select v_payout_id, v_reference;
end;
$$;

create or replace function public.get_organizer_ledger_transactions(
  p_cursor_created_at timestamp with time zone, p_cursor_id uuid, p_limit integer)
returns table(entry_id uuid, line text, event_id uuid, event_title text, amount numeric,
              currency text, status text, reference text, created_at timestamp with time zone)
language plpgsql
security definer
set search_path = ''
as $$
BEGIN
  RETURN QUERY
  WITH unified AS (
    SELECT le.id, 'ticket_sale'::text, le.event_id, e.title,
           le.gross_amount, le.currency::text, 'successful'::text,
           le.ticket_checkout_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'earning'

    UNION ALL

    SELECT le.id, 'platform_fee'::text, le.event_id, e.title,
           -1 * le.fee_amount, le.currency::text, 'completed'::text,
           le.ticket_checkout_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'earning'
      AND COALESCE(le.fee_amount, 0) <> 0

    UNION ALL

    SELECT le.id, 'refund'::text, le.event_id, e.title,
           le.amount, le.currency::text, 'processed'::text,
           le.transaction_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'refund_adjustment'

    UNION ALL

    SELECT le.id, 'refund'::text, le.event_id, e.title,
           le.amount, le.currency::text,
           CASE t.status WHEN 'refunded' THEN 'processed' ELSE 'processing' END,
           le.transaction_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    JOIN public.transaction t ON t.id = le.transaction_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'refund_hold'

    UNION ALL

    SELECT le.id, 'refund_release'::text, le.event_id, e.title,
           le.amount, le.currency::text, 'completed'::text,
           le.transaction_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'refund_release'

    UNION ALL

    SELECT le.id, 'promoter_commission'::text, le.event_id, e.title,
           le.amount, le.currency::text,
           CASE WHEN public.is_event_settled(le.event_id) THEN 'completed' ELSE 'pending' END,
           le.ticket_checkout_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'promoter_commission'

    UNION ALL

    SELECT le.id, 'promoter_commission_reversal'::text, le.event_id, e.title,
           le.amount, le.currency::text, 'completed'::text,
           le.ticket_checkout_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'promoter_commission_reversal'

    UNION ALL

    SELECT le.id, 'payout'::text, le.event_id, NULL::text,
           le.amount, le.currency::text, p.status,
           p.reference, le.created_at
    FROM public.organizer_ledger_entry le
    JOIN public.payout p ON p.id = le.payout_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'payout_hold'

    UNION ALL

    SELECT le.id, 'payout_release'::text, le.event_id, NULL::text,
           le.amount, le.currency::text, p.status,
           p.reference, le.created_at
    FROM public.organizer_ledger_entry le
    JOIN public.payout p ON p.id = le.payout_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'payout_release'
  )
  SELECT * FROM unified u
  WHERE p_cursor_created_at IS NULL
     OR u.created_at < p_cursor_created_at
     OR (u.created_at = p_cursor_created_at AND u.id < p_cursor_id)
  ORDER BY u.created_at DESC, u.id DESC
  LIMIT p_limit;
END;
$$;

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------

do $$
declare
  fn text;
begin
  -- Engine internals: nobody calls these directly.
  foreach fn in array array[
    'public._reward_loyalty_events(uuid, timestamptz, bigint)',
    'public._reward_loyalty_cycle_start(uuid, boolean, integer, timestamptz)',
    'public._reward_loyalty_evaluate(uuid)',
    'public._promoter_commission_post(uuid, bigint)',
    'public._reward_evaluate_promoter_commission(uuid)',
    'public._place_visit_code_at(uuid, bigint)',
    'public._reward_place_visits_evaluate(uuid, date)',
    'public._reward_dispatch(text, uuid)',
    'public._reward_accrue(uuid)',
    'public._reward_void(uuid, text)',
    'public._reward_settle_one(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', fn);
  end loop;

  -- Called by @abonten/services (service role) after its own checks.
  foreach fn in array array[
    'public.loyalty_progress(uuid)',
    'public.promoter_commission_event_stats(uuid)',
    'public.place_visit_code(uuid)',
    'public.place_visit_record(uuid, uuid, text, double precision, double precision, integer, text, text, boolean)',
    'public.place_visit_stats(uuid)',
    'public.rewards_run_monthly_rebates(date, uuid)',
    'public.rebate_stats(uuid)',
    'public.rewards_notify_pending()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

revoke all on function public.get_rewards_program_public() from public;
grant execute on function public.get_rewards_program_public() to anon, authenticated, service_role;
