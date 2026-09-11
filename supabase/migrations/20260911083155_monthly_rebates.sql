-- Abonten Rewards, Phase 6: organizer and venue rebates, organizer milestones.
--
--   rewards_run_monthly_rebates(period)  (pg_cron, 03:00 on the 3rd, for the
--   previous month; admins can also run any past month by hand)
--        │ for each event that SETTLED in the period (last end + 48 hours):
--        ├─ organizer_rebate  20% of the cash net revenue Abonten kept on the
--        │                    event's standing sales, as promotion credit
--        ├─ venue_rebate       5% of the same, to the owner of the verified
--        │                    place it was held at (other organizers' events)
--        └─ organizer_milestone  GH₵ 20 promotion credit, once, the first time
--                             an organizer's event sells to 50 unique verified
--                             buyers
--        ▼
--   reward_event (one decision per event per rule, risk-scored, budget-gated)
--        ▼ live: credit_grant (promotion lot, scope 'promotions', 6 months)
--          and released in the same run once the beneficiary's phone is
--          verified (otherwise rewards_settle_due releases it later).
--
-- What counts ("cash net revenue"): for every paid checkout of the event
-- whose tickets still stand and whose payment wasn't refunded or disputed,
-- that checkout's share of the transaction's platform_fee_entry.net_revenue
-- (service fee minus Paystack's cost), pro rata to its tickets still valid
-- and to the part paid in CASH (credit spent on tickets is already Abonten's
-- cost). Buyers who are the organizer (or the venue owner) or look like the
-- same person -- same email, phone, device, or the card they pay with -- are
-- left out. Faking sales to farm a rebate costs more in fees than it pays.
--
-- Gates (decision recorded as rejected, never re-evaluated): event
-- cancelled or removed, refund rate of the event at or above the rule's
-- max_event_refund_rate_bps (default 10%), beneficiary account younger than
-- min_account_age_days when the event settled (default 30 for organizers,
-- 0 for venues), no net revenue. Held for review: a single rebate at or above
-- the program's second-approver threshold (GH₵ 500), a venue owner who shares
-- a device with the organizer; rejected: same email / phone.
--
-- SHADOW MODE (and anyone outside the audience) records the decision without
-- posting credit, under a separate ':shadow' key -- so a month can be run in
-- shadow first and then for real once shadow mode is off. A live decision is
-- final. Nothing runs unless the rule has a live version (all ship inactive).

-- ---------------------------------------------------------------------
-- Run log
-- ---------------------------------------------------------------------

create table if not exists public.reward_rebate_run (
  id            uuid        primary key default gen_random_uuid(),
  period_start  date        not null check (extract(day from period_start) = 1),
  triggered_by  uuid,
  shadow_mode   boolean     not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  stats         jsonb       not null default '{}'::jsonb
);

create index if not exists idx_reward_rebate_run_started
  on public.reward_rebate_run (started_at desc);

alter table public.reward_rebate_run enable row level security;
revoke all on table public.reward_rebate_run from anon, authenticated;
grant all on table public.reward_rebate_run to service_role;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

create or replace function public._reward_risk_weight(p_flag text, p_weights jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (p_weights ->> p_flag)::integer,
    case p_flag
      when 'shared_device'            then 60
      when 'new_buyer_account'        then 15
      when 'referrer_refund_rate'     then 40
      when 'event_concentration'      then 25
      when 'velocity'                 then 30
      when 'open_dispute'             then 80
      when 'checked_in'               then -15
      when 'bind_burst'               then 30
      when 'referrer_lifetime_review' then 30
      when 'large_rebate'             then 30
      when 'review_threshold'         then 30
      when 'reject_threshold'         then 70
      else 0
    end);
$$;

-- Signals that two accounts are the same person: same email (Gmail dots and
-- +tags ignored), same phone number, or the same device.
create or replace function public._reward_same_person_flags(p_a uuid, p_b uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_a     record;
  v_b     record;
  v_flags text[] := '{}';
begin
  if p_a is null or p_b is null then
    return v_flags;
  end if;
  select u.email, u.phone into v_a from auth.users u where u.id = p_a;
  select u.email, u.phone into v_b from auth.users u where u.id = p_b;
  if public._normalized_email(v_a.email) is not null
     and public._normalized_email(v_a.email) = public._normalized_email(v_b.email) then
    v_flags := array_append(v_flags, 'same_email');
  end if;
  if coalesce(v_a.phone, '') <> '' and coalesce(v_b.phone, '') <> ''
     and right(regexp_replace(v_a.phone, '\D', '', 'g'), 9)
       = right(regexp_replace(v_b.phone, '\D', '', 'g'), 9) then
    v_flags := array_append(v_flags, 'same_phone');
  end if;
  if exists (select 1 from public.device_install a
             join public.device_install b on b.install_id = a.install_id
             where a.user_id = p_a and b.user_id = p_b)
     or exists (select 1 from public.device_token a
                join public.device_token b on b.token = a.token
                where a.user_id = p_a and b.user_id = p_b) then
    v_flags := array_append(v_flags, 'shared_device');
  end if;
  return v_flags;
end;
$$;

-- The rebate basis of one event: its standing paid sales, excluding buyers
-- linked to any of p_owners (see the header). Also the event's refund rate
-- over all paid tickets (a quality gate) and its unique counted buyers.
create or replace function public._reward_event_rebate_basis(p_event_id uuid, p_owners uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rec          record;
  v_fps        text[];
  v_net        numeric := 0;
  v_revenue    bigint := 0;
  v_buyers     uuid[] := '{}';
  v_counted    integer := 0;
  v_linked     integer := 0;
  v_disputed   integer := 0;
  v_units      integer := 0;
  v_refunded   integer := 0;
  v_is_linked  boolean;
  o            uuid;
begin
  -- The cards / wallets the owners pay with.
  select coalesce(array_agg(distinct x.fp), '{}') into v_fps
  from (select public._payment_fingerprint(t.payment_gateway_response) as fp
        from public.transaction t where t.user_id = any (p_owners)) x
  where x.fp is not null;

  for rec in
    select tc.id, tc.user_id, tc.total_price, tc.status as tc_status,
           u.units, u.units_valid,
           x.id as txn_id, x.status as txn_status,
           coalesce(x.amount, 0) as cash, coalesce(x.credit_amount, 0) as credit,
           x.payment_gateway_response,
           f.net_revenue, f.ticket_revenue
    from public.ticket_checkout tc
    cross join lateral (
      select count(*)::integer as units,
             (count(*) filter (where t.status <> 'cancelled'))::integer as units_valid,
             (array_agg(t.transaction_id) filter (where t.transaction_id is not null))[1] as txn_id
      from public.ticket t
      where t.ticket_checkout_id = tc.id
    ) u
    left join public.transaction x on x.id = u.txn_id
    left join public.platform_fee_entry f on f.transaction_id = x.id and f.entry_type = 'fee'
    where tc.event_id = p_event_id
      and tc.total_price > 0
      and u.units > 0
      and u.txn_id is not null
    order by tc.id
  loop
    v_units := v_units + rec.units;
    if rec.tc_status <> 'paid' or rec.txn_status in ('refund_pending', 'refunded') then
      v_refunded := v_refunded + rec.units;
      continue;
    end if;
    v_refunded := v_refunded + (rec.units - rec.units_valid);
    continue when rec.units_valid = 0;

    -- coalesce: a payment with no fingerprint must still get the checks below.
    v_is_linked := rec.user_id is null
      or coalesce(public._payment_fingerprint(rec.payment_gateway_response) = any (v_fps), false);
    if not v_is_linked then
      foreach o in array p_owners loop
        if rec.user_id = o or cardinality(public._reward_same_person_flags(rec.user_id, o)) > 0 then
          v_is_linked := true;
          exit;
        end if;
      end loop;
    end if;
    if v_is_linked then
      v_linked := v_linked + 1;
      continue;
    end if;

    if exists (select 1 from public.payment_dispute d
               where d.transaction_id = rec.txn_id and d.resolved_at is null) then
      v_disputed := v_disputed + 1;
      continue;
    end if;

    v_counted := v_counted + 1;
    v_revenue := v_revenue + floor(rec.total_price * 100 * rec.units_valid::numeric / rec.units)::bigint;
    if not (rec.user_id = any (v_buyers)) then
      v_buyers := array_append(v_buyers, rec.user_id);
    end if;
    if coalesce(rec.ticket_revenue, 0) > 0 and coalesce(rec.net_revenue, 0) > 0 and rec.cash > 0 then
      v_net := v_net + rec.net_revenue * 100
               * (rec.total_price / rec.ticket_revenue)
               * (rec.units_valid::numeric / rec.units)
               * (rec.cash / (rec.cash + rec.credit));
    end if;
  end loop;

  return jsonb_build_object(
    'net_cash_minor', floor(v_net)::bigint,
    'ticket_revenue_minor', v_revenue,
    'counted_checkouts', v_counted,
    'unique_buyers', coalesce(cardinality(v_buyers), 0),
    'linked_checkouts_excluded', v_linked,
    'disputed_checkouts_excluded', v_disputed,
    'paid_units', v_units,
    'refunded_units', v_refunded,
    'refund_rate_bps', case when v_units > 0 then (v_refunded * 10000) / v_units else 0 end);
end;
$$;

-- ---------------------------------------------------------------------
-- The decisions
-- ---------------------------------------------------------------------

-- Organizer or venue rebate for one settled event. Returns the reward_event
-- id it recorded (null when there was nothing to decide).
create or replace function public._reward_rebate_evaluate(p_rule_key text, p_event_id uuid, p_period date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule        public.reward_rule;
  v_settings    public.reward_program_setting;
  v_event       record;
  v_place_id    uuid;
  v_place_name  text;
  v_place_owner uuid;
  v_place_ok    boolean;
  v_place_mod   text;
  v_beneficiary uuid;
  v_owners      uuid[];
  v_shadow      boolean;
  v_key         text;
  v_basis       jsonb;
  v_settles     timestamptz;
  v_min_age     integer;
  v_max_refund  integer;
  v_net         bigint;
  v_amount      bigint := 0;
  v_flags       text[] := '{}';
  v_weights     jsonb;
  v_score       integer := 0;
  v_decision    text := 'auto';
  v_status      text;
  v_reason      text;
  v_id          uuid;
  f             text;
begin
  if p_rule_key not in ('organizer_rebate', 'venue_rebate') then
    raise exception 'Not a rebate rule: %', p_rule_key using errcode = '22023';
  end if;
  select * into v_rule from public.reward_rule where rule_key = p_rule_key and is_active;
  if not found then
    return null;
  end if;

  select e.id, e.title, e.organizer_id, e.status, e.moderation_state, e.place_id
    into v_event
  from public.event e where e.id = p_event_id;
  if not found then
    return null;
  end if;

  if p_rule_key = 'organizer_rebate' then
    v_beneficiary := v_event.organizer_id;
    v_owners := array[v_event.organizer_id];
  else
    if v_event.place_id is null then
      return null;
    end if;
    select p.id, p.name, p.owner_id, p.verified, p.moderation_state
      into v_place_id, v_place_name, v_place_owner, v_place_ok, v_place_mod
    from public.place p where p.id = v_event.place_id;
    -- Only verified places, and only other organizers' events.
    if v_place_id is null or not v_place_ok or v_place_owner = v_event.organizer_id then
      return null;
    end if;
    v_beneficiary := v_place_owner;
    v_owners := array[v_event.organizer_id, v_place_owner];
  end if;

  select * into v_settings from public.reward_program_setting where id = 1;
  v_weights := coalesce(v_settings.risk_weights, '{}'::jsonb);
  v_shadow := v_settings.shadow_mode or not public.rewards_enabled_for_user(v_beneficiary);

  -- A live decision is final; a shadow one doesn't stop a later live run.
  v_key := p_rule_key || ':' || p_event_id;
  if exists (select 1 from public.reward_event e where e.idempotency_key = v_key) then
    return null;
  end if;
  if v_shadow then
    v_key := v_key || ':shadow';
    if exists (select 1 from public.reward_event e where e.idempotency_key = v_key) then
      return null;
    end if;
  end if;

  v_settles := public._event_settles_at(p_event_id);
  v_basis := public._reward_event_rebate_basis(p_event_id, v_owners);
  v_net := (v_basis ->> 'net_cash_minor')::bigint;
  v_min_age := coalesce((v_rule.caps ->> 'min_account_age_days')::integer,
                        case when p_rule_key = 'organizer_rebate' then 30 else 0 end);
  v_max_refund := coalesce((v_rule.caps ->> 'max_event_refund_rate_bps')::integer, 1000);
  v_amount := floor(v_net * coalesce(v_rule.net_share_cap_bps, 0) / 10000.0)::bigint;

  v_reason := case
    when v_event.status = 'canceled' then 'event_cancelled'
    when v_event.moderation_state = 'removed' then 'event_removed'
    when v_place_mod = 'removed' then 'place_removed'
    when v_min_age > 0
         and (select u.created_at from public.user_info u where u.id = v_beneficiary)
           > v_settles - make_interval(days => v_min_age) then 'account_too_new'
    when (v_basis ->> 'refund_rate_bps')::integer >= v_max_refund then 'refund_rate'
    when v_amount <= 0 then 'no_net_revenue'
  end;
  if v_reason is not null then
    v_status := 'rejected';
  end if;

  if p_rule_key = 'venue_rebate' then
    -- The "other organizer" must really be someone else.
    v_flags := v_flags || public._reward_same_person_flags(v_event.organizer_id, v_place_owner);
  end if;
  if v_amount >= v_settings.dual_approval_threshold_minor then
    v_flags := array_append(v_flags, 'large_rebate');
  end if;

  foreach f in array v_flags loop
    v_score := v_score + public._reward_risk_weight(f, v_weights);
  end loop;
  v_score := greatest(v_score, 0);

  if v_flags && array['same_email', 'same_phone'] then
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
    event_id, idempotency_key, is_shadow, status, decision, amount_minor, basis,
    risk_score, risk_flags, status_reason, release_at
  ) values (
    p_rule_key, v_rule.id, v_rule.version, v_beneficiary, 'event', p_event_id,
    p_event_id, v_key, v_shadow, v_status, v_decision,
    case when v_status = 'rejected' then 0 else v_amount end,
    v_basis || jsonb_build_object(
      'period_start', p_period,
      'settles_at', v_settles,
      'net_share_bps', v_rule.net_share_cap_bps,
      'computed_minor', v_amount,
      'place_id', v_place_id,
      'place_name', v_place_name),
    v_score, v_flags, v_reason, now()
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    return null;
  end if;

  if array_length(v_flags, 1) > 0 then
    insert into public.risk_signal (user_id, related_user_id, signal_type, severity, details, reward_event_id)
    select v_beneficiary, case when p_rule_key = 'venue_rebate' then v_event.organizer_id end, fl,
           case when fl in ('same_email', 'same_phone') then 'block'
                when public._reward_risk_weight(fl, v_weights) > 0 then 'review'
                else 'info' end,
           jsonb_build_object('event_id', p_event_id, 'rule', p_rule_key),
           v_id
    from unnest(v_flags) fl;
  end if;

  if v_status in ('pending', 'held') then
    perform public._reward_accrue(v_id);
    -- Monthly rewards are due as soon as they're decided.
    perform public._reward_settle_one(v_id, 'settle');
  end if;
  return v_id;
end;
$$;

-- The milestone: once per organizer per threshold, the first time one of
-- their events sells to that many unique verified buyers who aren't linked
-- to them. Nothing is recorded when an event doesn't reach it (or fails a
-- gate), so a later event still can.
create or replace function public._reward_milestone_evaluate(p_event_id uuid, p_period date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule      public.reward_rule;
  v_settings  public.reward_program_setting;
  v_event     record;
  v_threshold integer;
  v_buyers    integer;
  v_basis     jsonb;
  v_shadow    boolean;
  v_key       text;
  v_id        uuid;
begin
  select * into v_rule from public.reward_rule where rule_key = 'organizer_milestone' and is_active;
  if not found or coalesce(v_rule.flat_minor, 0) <= 0 then
    return null;
  end if;

  select e.id, e.title, e.organizer_id, e.status, e.moderation_state into v_event
  from public.event e where e.id = p_event_id;
  if not found or v_event.status = 'canceled' or v_event.moderation_state = 'removed' then
    return null;
  end if;

  v_threshold := coalesce((v_rule.caps ->> 'unique_paid_attendees')::integer, 50);
  select * into v_settings from public.reward_program_setting where id = 1;
  v_shadow := v_settings.shadow_mode or not public.rewards_enabled_for_user(v_event.organizer_id);

  v_key := 'organizer_milestone:' || v_event.organizer_id || ':' || v_threshold;
  if exists (select 1 from public.reward_event e where e.idempotency_key = v_key) then
    return null;
  end if;
  if v_shadow then
    v_key := v_key || ':shadow';
    if exists (select 1 from public.reward_event e where e.idempotency_key = v_key) then
      return null;
    end if;
  end if;

  v_buyers := public._reward_event_unique_buyers(p_event_id, v_event.organizer_id);
  if v_buyers < v_threshold then
    return null;
  end if;

  v_basis := public._reward_event_rebate_basis(p_event_id, array[v_event.organizer_id]);
  if (v_basis ->> 'refund_rate_bps')::integer
       >= coalesce((v_rule.caps ->> 'max_event_refund_rate_bps')::integer, 1000)
     or (select u.created_at from public.user_info u where u.id = v_event.organizer_id)
       > public._event_settles_at(p_event_id)
         - make_interval(days => coalesce((v_rule.caps ->> 'min_account_age_days')::integer, 30)) then
    return null;
  end if;

  insert into public.reward_event (
    rule_key, rule_id, rule_version, beneficiary_user_id, source_type, source_id,
    event_id, idempotency_key, is_shadow, status, decision, amount_minor, basis,
    risk_score, risk_flags, release_at
  ) values (
    'organizer_milestone', v_rule.id, v_rule.version, v_event.organizer_id, 'event', p_event_id,
    p_event_id, v_key, v_shadow, 'pending', 'auto', v_rule.flat_minor,
    jsonb_build_object(
      'period_start', p_period,
      'unique_buyers', v_buyers,
      'threshold', v_threshold,
      'refund_rate_bps', v_basis -> 'refund_rate_bps'),
    0, '{}', now()
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is not null then
    perform public._reward_accrue(v_id);
    perform public._reward_settle_one(v_id, 'settle');
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Engine functions extended from Phases 4-5
-- ---------------------------------------------------------------------

-- Re-checks one reward against the current state of what earned it.
--   'recheck': something changed: void or hold now if needed.
--   'settle':  it's due: also release it when everything checks out.
-- Event referrals release pro rata to the tickets still valid; everything
-- else is all-or-nothing. Returns the resulting status.
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

  if r.rule_key = 'event_referral' then
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

-- Accrues a decided reward: commits the budget and creates the credit lot
-- (pending until release; released at once for 'immediate' rules such as
-- welcome credit). Shadow rewards do neither.
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

  v_period := public._reward_commit_budget(r.amount_minor);
  if v_period is null then
    update public.reward_event e
    set status = 'deferred', status_reason = 'budget_exhausted', updated_at = now()
    where e.id = r.id;
    return 'deferred';
  end if;

  select * into v_rule from public.reward_rule where id = r.rule_id;
  v_immediate := v_rule.release_policy = 'immediate';

  if r.rule_key in ('event_referral', 'organizer_rebate', 'venue_rebate', 'organizer_milestone') then
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
  return case when r.decision = 'review' then 'held' else 'pending' end;
end;
$$;

-- ---------------------------------------------------------------------
-- The monthly run
-- ---------------------------------------------------------------------

-- Evaluates every event that settled in the month starting p_period_start
-- (default: last month) for the three rules, releases what's due and tells
-- each person once. Safe to run again: an event already decided (live) is
-- skipped. One failing event never stops the run; failures open an incident.
create or replace function public.rewards_run_monthly_rebates(
  p_period_start date default null,
  p_triggered_by uuid default null
)
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
  v_errors    integer := 0;
  v_last_err  text;
  v_stats     jsonb;
  v_event_id  uuid;
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
  select * into v_settings from public.reward_program_setting where id = 1;
  insert into public.reward_rebate_run (period_start, triggered_by, shadow_mode)
  values (v_period, p_triggered_by, v_settings.shadow_mode)
  returning id into v_run;

  if not exists (select 1 from public.reward_rule r
                 where r.is_active
                   and r.rule_key in ('organizer_rebate', 'venue_rebate', 'organizer_milestone')) then
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

  -- One notification per person for the rebates released now (live only).
  for rec in
    select e.beneficiary_user_id as user_id,
           sum(e.released_minor) filter (where e.rule_key <> 'organizer_milestone') as rebate_minor,
           sum(e.released_minor) filter (where e.rule_key = 'organizer_milestone') as milestone_minor,
           max(e.basis ->> 'unique_buyers') filter (where e.rule_key = 'organizer_milestone') as buyers
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
  end loop;

  select jsonb_build_object(
    'events', v_events,
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
      format('The rebate run for %s failed on %s event(s). Last error: %s. Fix the cause, then run the month again from Admin › Rewards › Rebates (decided events are skipped).',
             to_char(v_period, 'YYYY-MM'), v_errors, v_last_err),
      'medium');
  end if;

  return v_stats || jsonb_build_object('run_id', v_run, 'period_start', v_period);
end;
$$;

-- ---------------------------------------------------------------------
-- What an organizer / venue owner sees
-- ---------------------------------------------------------------------

-- The caller's rebate figures (live only -- shadow decisions are never
-- shown to users) and how much of their credit only pays for promotions.
create or replace function public.rebate_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select e.rule_key, e.status, e.amount_minor, e.released_minor, e.basis, e.created_at,
           ev.title as event_title
    from public.reward_event e
    left join public.event ev on ev.id = e.event_id
    where e.beneficiary_user_id = p_user_id
      and e.rule_key in ('organizer_rebate', 'venue_rebate', 'organizer_milestone')
      and not e.is_shadow
      and e.status in ('pending', 'held', 'deferred', 'released')
  ),
  last_period as (
    select (r.basis ->> 'period_start')::date as period_start, sum(r.released_minor) as amount_minor
    from r
    where r.status = 'released' and r.rule_key in ('organizer_rebate', 'venue_rebate')
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
                                       when 'venue_rebate' then 'venue' else 'milestone' end,
               'event_title', x.event_title,
               'amount_minor', case when x.status = 'released' then x.released_minor else x.amount_minor end,
               'status', case when x.status = 'released' then 'earned' else 'pending' end,
               'period_start', x.basis ->> 'period_start',
               'at', x.created_at) order by x.created_at desc)
      from (select * from r order by r.created_at desc limit 10) x), '[]'::jsonb)
  );
$$;

-- Same as Phase 1, plus the milestone terms.
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
-- Privileges + schedule
-- ---------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public._reward_risk_weight(text, jsonb)',
    'public._reward_same_person_flags(uuid, uuid)',
    'public._reward_event_rebate_basis(uuid, uuid[])',
    'public._reward_rebate_evaluate(text, uuid, date)',
    'public._reward_milestone_evaluate(uuid, date)',
    'public._reward_settle_one(uuid, text)',
    'public._reward_accrue(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', fn);
  end loop;

  foreach fn in array array[
    'public.rewards_run_monthly_rebates(date, uuid)',
    'public.rebate_stats(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

revoke all on function public.get_rewards_program_public() from public;
grant execute on function public.get_rewards_program_public() to anon, authenticated, service_role;

select cron.schedule('rewards-monthly-rebates', '0 3 3 * *',
  $cron$select public.rewards_run_monthly_rebates(null, null);$cron$);
