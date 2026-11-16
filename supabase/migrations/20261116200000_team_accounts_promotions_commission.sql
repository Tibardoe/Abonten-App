-- Team accounts: paying to promote a Spotlight as a team, and the promoter
-- commission on a team's events (Tickets, entry and teams plan, Part 2,
-- stage 5; decision X36; docs/architecture/team-accounts.md §4i).
--
-- 1. Rewards never pay a team's own people for its own events. Every place
--    the reward engine refused the organizer as buyer, referrer or promoter
--    ("organizer_linked") now refuses an active member of the organizer's
--    team too: event referral rewards, the promoter commission (X36: a
--    member earns on their own team's events only once an Owner adds them
--    as a promoter, which comes with Part 7), the friend-invite reward, the
--    referral stamped at checkout, and the loyalty fee rebate.
-- 2. Notices about a team's paid Spotlight promotions go to the members
--    who pay for them (promotions.buy: Owners and Finance) instead of
--    everyone who posts.
--
-- The functions below are the latest definitions, unchanged except for the
-- marked lines (fingerprinted against Preview and Production first).

-- ---------------------------------------------------------------------------
-- 1. The team rule
-- ---------------------------------------------------------------------------

create or replace function public._reward_organizer_linked(p_organizer uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_organizer is not null
     and p_user is not null
     and (p_organizer = p_user or public.is_team_member(p_organizer, p_user));
$$;

revoke all on function public._reward_organizer_linked(uuid, uuid) from public, anon, authenticated;
grant execute on function public._reward_organizer_linked(uuid, uuid) to service_role;

-- From 20260926100500_money_scale_per_currency.sql, with the team rule (section 1).
CREATE OR REPLACE FUNCTION public._reward_evaluate_event_referral(p_checkout_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  v_basis := floor(coalesce(v_tc.total_price, 0) * public.currency_scale((select tt.currency::text from public.ticket_type tt where tt.id = v_tc.ticket_type_id)))::bigint;

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
      v_net_share := floor(greatest(v_fee.net_revenue, 0) * public.currency_scale((select tt.currency::text from public.ticket_type tt where tt.id = v_tc.ticket_type_id))
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
  if public._reward_organizer_linked(v_event.organizer_id, v_buyer)
     or public._reward_organizer_linked(v_event.organizer_id, v_referrer) then
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
$function$;

-- From 20260926100500_money_scale_per_currency.sql, with the team rule (section 1).
CREATE OR REPLACE FUNCTION public._reward_evaluate_promoter_commission(p_checkout_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  v_basis := floor(coalesce(v_tc.total_price, 0) * public.currency_scale((select tt.currency::text from public.ticket_type tt where tt.id = v_tc.ticket_type_id)))::bigint;
  v_amount := floor(v_basis * v_rate / 10000.0)::bigint;

  if v_txn.id is null then
    v_status := 'rejected';
    v_reason := 'no_payment';
  elsif v_currency is null then
    raise exception 'organizer earning not recorded yet for checkout %', p_checkout_id;
  elsif v_currency <> v_rule.currency then
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
  if public._reward_organizer_linked(v_event.organizer_id, v_buyer)
     or public._reward_organizer_linked(v_event.organizer_id, v_promoter) then
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
$function$;

-- From 20260926100300_reward_notices_in_credit_currency.sql, with the team rule (section 1).
CREATE OR REPLACE FUNCTION public._reward_friend_decide(p_referee uuid, p_path text, p_source_type text, p_source_id uuid, p_event_id uuid, p_transaction_id uuid, p_basis jsonb, p_release_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rule      public.reward_rule;
  v_settings  public.reward_program_setting;
  v_ur        public.user_referral;
  v_referrer  uuid;
  v_window    integer;
  v_shadow    boolean;
  v_key       text;
  v_flags     text[] := '{}';
  v_score     integer := 0;
  v_weights   jsonb;
  v_decision  text := 'auto';
  v_status    text;
  v_reason    text;
  v_month     integer;
  v_lifetime  integer;
  v_burst     integer;
  v_organizer uuid;
  v_me_auth   record;
  v_ref_auth  record;
  v_fp        text;
  v_id        uuid;
  f           text;
begin
  select * into v_rule from public.reward_rule where rule_key = 'friend_referral_referrer' and is_active;
  if not found then
    return null;
  end if;

  select * into v_ur from public.user_referral where referee_user_id = p_referee for update;
  if not found or v_ur.status <> 'bound' then
    return null;
  end if;

  v_window := coalesce((v_rule.caps ->> 'qualify_within_days')::integer, 60);
  if (select u.created_at from public.user_info u where u.id = p_referee)
       < now() - make_interval(days => v_window) then
    update public.user_referral ur set status = 'expired', updated_at = now()
    where ur.referee_user_id = p_referee;
    return null;
  end if;

  v_key := 'friend_referral:' || p_referee || ':' || p_source_id;
  if exists (select 1 from public.reward_event where idempotency_key = v_key) then
    return null;
  end if;

  v_referrer := v_ur.referrer_user_id;
  select * into v_settings from public.reward_program_setting where id = 1;
  v_weights := coalesce(v_settings.risk_weights, '{}'::jsonb);
  v_shadow := v_settings.shadow_mode or not public.rewards_enabled_for_user(v_referrer);

  -- Caps, counted within the same class (shadow / live).
  select count(*) filter (where e.created_at >= date_trunc('month', now())), count(*)
    into v_month, v_lifetime
  from public.reward_event e
  where e.rule_key = 'friend_referral_referrer' and e.beneficiary_user_id = v_referrer
    and e.is_shadow = v_shadow
    and e.status in ('pending', 'held', 'released', 'deferred');
  if v_month >= coalesce((v_rule.caps ->> 'per_referrer_month_count')::integer, 10) then
    v_status := 'rejected';
    v_reason := 'referrer_cap';
  end if;

  -- Risk signals (same weights table as event referrals).
  if p_event_id is not null and p_path = 'first_order' then
    select e.organizer_id into v_organizer from public.event e where e.id = p_event_id;
    -- An organizer can't farm invite rewards by having invited friends buy
    -- their own tickets.
    if public._reward_organizer_linked(v_organizer, v_referrer) then
      v_flags := array_append(v_flags, 'organizer_linked');
    end if;
  end if;

  select u.email, u.phone into v_me_auth from auth.users u where u.id = p_referee;
  select u.email, u.phone into v_ref_auth from auth.users u where u.id = v_referrer;
  if public._normalized_email(v_me_auth.email) = public._normalized_email(v_ref_auth.email) then
    v_flags := array_append(v_flags, 'same_email');
  end if;
  if coalesce(v_me_auth.phone, '') <> '' and coalesce(v_ref_auth.phone, '') <> ''
     and right(regexp_replace(v_me_auth.phone, '\D', '', 'g'), 9)
       = right(regexp_replace(v_ref_auth.phone, '\D', '', 'g'), 9) then
    v_flags := array_append(v_flags, 'same_phone');
  end if;

  if p_transaction_id is not null then
    select public._payment_fingerprint(t.payment_gateway_response) into v_fp
    from public.transaction t where t.id = p_transaction_id;
    if v_fp is not null and exists (
      select 1 from public.transaction t
      where t.user_id = v_referrer and public._payment_fingerprint(t.payment_gateway_response) = v_fp
    ) then
      v_flags := array_append(v_flags, 'same_payment_method');
    end if;
    if exists (select 1 from public.payment_dispute d
               where d.transaction_id = p_transaction_id and d.resolved_at is null) then
      v_flags := array_append(v_flags, 'open_dispute');
    end if;
  end if;

  if exists (select 1 from public.device_install a
             join public.device_install b on b.install_id = a.install_id
             where a.user_id = p_referee and b.user_id = v_referrer)
     or exists (select 1 from public.device_token a
                join public.device_token b on b.token = a.token
                where a.user_id = p_referee and b.user_id = v_referrer) then
    v_flags := array_append(v_flags, 'shared_device');
  end if;

  -- More than 5 friends bound within an hour of this one.
  select count(*) into v_burst
  from public.user_referral ur
  where ur.referrer_user_id = v_referrer
    and ur.bound_at between v_ur.bound_at - interval '1 hour' and v_ur.bound_at + interval '1 hour';
  if v_burst > 5 then
    v_flags := array_append(v_flags, 'bind_burst');
  end if;

  if (select count(*) from public.reward_event e
      where e.beneficiary_user_id = v_referrer and e.rule_key = 'friend_referral_referrer'
        and e.created_at > now() - interval '24 hours') >= 5 then
    v_flags := array_append(v_flags, 'velocity');
  end if;

  if v_lifetime >= coalesce((v_rule.caps ->> 'lifetime_review_count')::integer, 50) then
    v_flags := array_append(v_flags, 'referrer_lifetime_review');
  end if;

  if p_source_type = 'ticket_checkout' and exists (
    select 1 from public.ticket t where t.ticket_checkout_id = p_source_id and t.status = 'used'
  ) then
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
    'friend_referral_referrer', v_rule.id, v_rule.version, v_referrer, p_source_type, p_source_id,
    p_event_id, p_referee, p_transaction_id, v_key, v_shadow, v_status,
    v_decision, case when v_status = 'rejected' then 0 else v_rule.flat_minor end,
    coalesce(p_basis, '{}'::jsonb) || jsonb_build_object(
      'referral_code', v_ur.code,
      'bind_source', v_ur.source,
      'bound_at', v_ur.bound_at),
    v_score, v_flags, v_reason, p_release_at
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    return null;
  end if;

  if array_length(v_flags, 1) > 0 then
    insert into public.risk_signal (user_id, related_user_id, signal_type, severity, details, reward_event_id)
    select v_referrer, p_referee, fl,
           case when fl in ('self_referral', 'organizer_linked', 'same_email', 'same_phone',
                            'same_payment_method') then 'block'
                when public._reward_risk_weight(fl, v_weights) > 0 then 'review'
                else 'info' end,
           jsonb_build_object('path', p_path, 'source_type', p_source_type, 'source_id', p_source_id),
           v_id
    from unnest(v_flags) fl;
  end if;

  update public.user_referral ur
  set status          = case when v_status = 'rejected' then 'rejected' else 'qualified' end,
      qualified_via   = p_path,
      qualified_at    = now(),
      reward_event_id = v_id,
      updated_at      = now()
  where ur.referee_user_id = p_referee;

  if v_status in ('pending', 'held') then
    perform public._reward_accrue(v_id);
    -- The sale may already have changed (a refund processed first).
    perform public._reward_settle_one(v_id, 'recheck');

    if not v_shadow and exists (select 1 from public.reward_event e
                                where e.id = v_id and e.status in ('pending', 'held')) then
      perform public._reward_notify(
        v_referrer, 'referral_qualified',
        case p_path
          when 'first_order' then 'Your friend bought a ticket'
          when 'organizer_sales' then 'Your friend''s event is selling'
          else 'Your friend claimed their place'
        end,
        format('%s qualified. %s is pending for you and unlocks %s.',
               public._referral_display_name(p_referee),
               public.money_text(v_rule.flat_minor,
                 (select e.currency from public.reward_event e where e.id = v_id)),
               case p_path when 'place_claim' then 'in about two weeks' else 'after the event' end));
      update public.reward_event e set notified_pending_at = now() where e.id = v_id;
    end if;
  end if;

  return v_id;
end;
$function$;

-- From 20260911015208_referral_capture.sql, with the team rule (section 1).
create or replace function public.stamp_checkout_referral(
  p_checkout_session_id uuid,
  p_user_id             uuid,
  p_code                text,
  p_touched_at          timestamptz,
  p_source              text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings  public.reward_program_setting;
  v_ref       public.referral_code;
  v_event_id  uuid;
  v_organizer uuid;
  v_status    smallint;
  v_updated   integer;
begin
  select * into v_settings from public.reward_program_setting s where s.id = 1;
  if not coalesce(v_settings.referral_capture_enabled, false) then
    return 'capture_off';
  end if;

  select * into v_ref from public.referral_code rc where rc.code = upper(trim(p_code));
  if not found or v_ref.disabled_at is not null then
    return 'unknown_code';
  end if;
  if v_ref.user_id = p_user_id then
    return 'own_code';
  end if;

  if p_touched_at is null
     or p_touched_at > now() + interval '5 minutes'
     or p_touched_at < now() - make_interval(days => v_settings.referral_attribution_window_days) then
    return 'expired';
  end if;

  select tc.event_id into v_event_id
  from public.ticket_checkout tc
  where tc.checkout_session_id = p_checkout_session_id
    and tc.user_id = p_user_id
    and tc.status = 'pending'
  limit 1;
  if v_event_id is null then
    return 'not_found';
  end if;

  select e.organizer_id into v_organizer from public.event e where e.id = v_event_id;
  -- Organizers can share their own events but never earn on them, and an
  -- organizer buying their own tickets through someone's link isn't a
  -- referral.
  if public._reward_organizer_linked(v_organizer, v_ref.user_id)
     or public._reward_organizer_linked(v_organizer, p_user_id) then
    return 'organizer_linked';
  end if;

  select u.status_id into v_status from public.user_info u where u.id = v_ref.user_id;
  if v_status in (2, 3)
     or exists (select 1 from public.credit_account a
                where a.user_id = v_ref.user_id and a.status <> 'active') then
    return 'referrer_restricted';
  end if;

  update public.ticket_checkout tc
  set referrer_user_id    = v_ref.user_id,
      referral_code       = v_ref.code,
      referral_touched_at = p_touched_at,
      referral_source     = coalesce(p_source, 'link')
  where tc.checkout_session_id = p_checkout_session_id
    and tc.user_id = p_user_id
    and tc.status = 'pending'
    and tc.referrer_user_id is null;
  get diagnostics v_updated = row_count;

  return case when v_updated > 0 then 'stamped' else 'not_found' end;
end;
$$;

-- From 20260926100500_money_scale_per_currency.sql, with the team rule (section 1).
CREATE OR REPLACE FUNCTION public._reward_loyalty_evaluate(p_checkout_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if public._reward_organizer_linked(v_event.organizer_id, v_tc.user_id) then
    return null;
  end if;
  v_basis := floor(coalesce(v_tc.total_price, 0) * public.currency_scale((select tt.currency::text from public.ticket_type tt where tt.id = v_tc.ticket_type_id)))::bigint;
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
    v_fee_minor := floor(greatest(v_fee.service_fee, 0) * public.currency_scale((select tt.currency::text from public.ticket_type tt where tt.id = v_tc.ticket_type_id))
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
        format('You''ve bought tickets to %s different events. The %s service fee on this order comes back as credit after %s.',
               v_required,
               public.money_text(v_amount,
                 (select e.currency from public.reward_event e where e.id = v_id)),
               coalesce(v_event.title, 'the event')));
      update public.reward_event e set notified_pending_at = now() where e.id = v_id;
    end if;
  end if;

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. A team's promotion notices go to those who pay for them
-- ---------------------------------------------------------------------------

-- From 20261116190000_team_accounts_verification.sql, with the team rule (section 1).
create or replace function public.team_notice_capability(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type like 'place_booking_%' then 'bookings.manage'
    when p_type in ('review_received', 'review_reply') then 'reviews.reply'
    when p_type = 'message' then 'messages.reply'
    when p_type = 'content_campaign' then 'promotions.buy'
    when p_type like 'content_%' then 'content.post'
    when p_type like 'refund_%' then 'refunds.issue'
    when p_type like 'payout_%' then 'payout.view'
    when p_type like 'ticket_plan_%' then 'money.view'
    when p_type like 'verification_%' then 'verification.request'
    when p_type = 'promotion_started' then 'promotions.buy'
    when p_type in (
      'promotion_credit_earned', 'milestone_reached', 'loyalty_reward',
      'reward_available', 'reward_pending', 'reward_reversed',
      'commission_pending', 'welcome_credit'
    ) then 'money.view'
    else 'team.profile'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if public.team_notice_capability('content_campaign') <> 'promotions.buy'
     or public.team_notice_capability('content_comment') <> 'content.post'
     or public.team_notice_capability('verification_approved') <> 'verification.request' then
    raise exception 'migration check: team notice capabilities';
  end if;
  if has_function_privilege('authenticated', 'public._reward_organizer_linked(uuid, uuid)', 'execute') then
    raise exception 'migration check: clients may run _reward_organizer_linked';
  end if;
end;
$$;
