-- Audit 2026-09-26: money converted with a fixed * 100.
--
-- CLAUDE.md's global-platform rule is that SQL money follows the row's
-- currency (money_round / minor_to_major), never "/ 100" or "* 100". Nine
-- functions still turned major units into minor units with * 100, which is
-- right only for currencies with two decimals. Côte d'Ivoire (XOF, no
-- decimals) is a configured draft market, so opening it would have:
--   * refused every paid Spotlight campaign (content_campaign_activate_from_
--     checkout compared amount * 100 with a budget priced in XOF's real
--     minor units) — money taken, campaign never started;
--   * raised a false "credit capture mismatch" on every credit-paid order
--     (credit_reconciliation_checks);
--   * computed rewards, thresholds and rebates 100x too large (the reward
--     evaluators and _reward_event_rebate_basis);
--   * added revenue in different currencies into one reward budget
--     (_reward_commit_budget — now counts the default market's currency only).
--
-- Each now scales by public.currency_scale(currency) = 10 ^ minor units of
-- that currency, keeping every floor/round exactly as it was, so amounts in
-- two-decimal currencies (Ghana) are unchanged to the pesewa. Every body is
-- the production definition (fingerprints checked on 2026-09-26; two differ
-- from production only in comments) with only these lines changed;
-- _reward_loyalty_evaluate builds on 20260926100300.

-- 10 ^ (the currency's minor units): 100 for GHS, 1 for XOF, 1000 for KWD.
-- A missing currency means the default market's; an unknown one is an error
-- (currency_minor_units raises), never a silent 100.
create or replace function public.currency_scale(p_currency text)
returns numeric
language sql
stable
set search_path = ''
as $$
  select power(10::numeric, public.currency_minor_units(
    coalesce(nullif(p_currency, ''), public.default_market_currency()::text)));
$$;

revoke all on function public.currency_scale(text) from public, anon, authenticated;
grant execute on function public.currency_scale(text) to service_role;

CREATE OR REPLACE FUNCTION public._reward_commit_budget(p_amount_minor bigint)
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_period   date := date_trunc('month', now())::date;
  v_settings public.reward_program_setting;
  v_net      bigint;
  v_ok       boolean;
begin
  if not exists (select 1 from public.reward_budget_period b where b.period_start = v_period) then
    select * into v_settings from public.reward_program_setting s where s.id = 1;
    -- The budget is in the default market's currency: only its revenue
    -- counts (amounts in different currencies are never added together).
    select coalesce(round(sum(f.net_revenue)
                          * public.currency_scale(public.default_market_currency()::text)), 0)::bigint
      into v_net
    from public.platform_fee_entry f
    where f.entry_type = 'fee' and f.created_at > now() - interval '30 days'
      and f.currency = public.default_market_currency();
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
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public._reward_event_rebate_basis(p_event_id uuid, p_owners uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
           f.net_revenue, f.ticket_revenue,
           public.currency_scale(x.currency::text) as scale
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
    v_revenue := v_revenue + floor(rec.total_price * rec.scale * rec.units_valid::numeric / rec.units)::bigint;
    if not (rec.user_id = any (v_buyers)) then
      v_buyers := array_append(v_buyers, rec.user_id);
    end if;
    if coalesce(rec.ticket_revenue, 0) > 0 and coalesce(rec.net_revenue, 0) > 0 and rec.cash > 0 then
      v_net := v_net + rec.net_revenue * rec.scale
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
$function$;

CREATE OR REPLACE FUNCTION public._reward_friend_qualify_order(p_checkout_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tc    public.ticket_checkout;
  v_rule  public.reward_rule;
  v_basis bigint;
  v_txn   record;
begin
  select * into v_tc from public.ticket_checkout where id = p_checkout_id;
  if not found or v_tc.status <> 'paid' or v_tc.user_id is null then
    return null;
  end if;
  if not exists (select 1 from public.user_referral ur
                 where ur.referee_user_id = v_tc.user_id and ur.status = 'bound') then
    return null;
  end if;

  select * into v_rule from public.reward_rule where rule_key = 'friend_referral_referrer' and is_active;
  if not found then
    return null;
  end if;

  v_basis := floor(coalesce(v_tc.total_price, 0) * public.currency_scale((select tt.currency::text from public.ticket_type tt where tt.id = v_tc.ticket_type_id)))::bigint;
  if v_basis < v_rule.min_basis_minor then
    return null;
  end if;

  select t.id, t.amount into v_txn
  from public.transaction t
  where t.id = (select tk.transaction_id from public.ticket tk
                where tk.ticket_checkout_id = p_checkout_id and tk.transaction_id is not null
                limit 1);
  -- Needs real cash: an order paid entirely with credit doesn't qualify
  -- (the friend stays bound, so a later order still can).
  if v_txn.id is null or coalesce(v_txn.amount, 0) <= 0 then
    return null;
  end if;

  return public._reward_friend_decide(
    v_tc.user_id, 'first_order', 'ticket_checkout', p_checkout_id, v_tc.event_id, v_txn.id,
    jsonb_build_object('path', 'first_order', 'order_minor', v_basis),
    public._event_settles_at(v_tc.event_id));
end;
$function$;

CREATE OR REPLACE FUNCTION public._reward_loyalty_events(p_user_id uuid, p_since timestamp with time zone, p_min_minor bigint)
 RETURNS TABLE(event_id uuid, first_paid_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select tc.event_id, min(coalesce(tc.completed_at, tc.created_at::timestamptz))
  from public.ticket_checkout tc
  join public.event e on e.id = tc.event_id
  where tc.user_id = p_user_id
    and tc.status = 'paid'
    and floor(tc.total_price * public.currency_scale(
          (select tt.currency::text from public.ticket_type tt where tt.id = tc.ticket_type_id)))
        >= greatest(p_min_minor, 1)
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
$function$;

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
  if v_event.organizer_id = v_tc.user_id then
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

CREATE OR REPLACE FUNCTION public.content_campaign_activate_from_checkout(p_checkout_id uuid, p_transaction_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- In the checkout's own currency (a fixed * 100 refused every paid
  -- campaign in a currency without two decimals, such as XOF).
  if public.major_to_minor(ck.total_price, ck.currency::text) <> v_minor then
    raise exception 'Checkout amount does not match the campaign budget' using errcode = '22023';
  end if;
  select public.major_to_minor(t.amount, t.currency::text) into v_tx_minor
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
$function$;

CREATE OR REPLACE FUNCTION public.credit_reconciliation_checks()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_unbalanced       integer;
  v_cache_drift      integer;
  v_lot_drift        integer;
  v_lot_invalid      integer;
  v_res_stuck        integer;
  v_capture_mismatch integer;
begin
  -- 1. Journals whose lines don't sum to zero (the deferred trigger should
  -- make this impossible; this catches it being dropped or bypassed).
  -- Recent window keeps the 30-minute run cheap at scale.
  select count(*) into v_unbalanced
  from (
    select e.journal_id
    from public.credit_entry e
    where e.created_at > now() - interval '2 days'
    group by e.journal_id
    having sum(e.amount_minor) <> 0 or count(*) < 2
  ) x;

  -- 2. Cached bucket balances that don't equal the sum of their entries.
  select count(*) into v_cache_drift
  from public.credit_account a
  left join lateral (
    select
      coalesce(sum(e.amount_minor) filter (where la.code = 'pending'), 0)     as pending,
      coalesce(sum(e.amount_minor) filter (where la.code = 'available'), 0)   as available,
      coalesce(sum(e.amount_minor) filter (where la.code = 'reserved'), 0)    as reserved,
      coalesce(sum(e.amount_minor) filter (where la.code = 'frozen'), 0)      as frozen,
      coalesce(sum(e.amount_minor) filter (where la.code = 'withdrawing'), 0) as withdrawing
    from public.credit_ledger_account la
    join public.credit_entry e on e.ledger_account_id = la.id
    where la.owner_user_id = a.user_id and la.currency = a.currency
  ) s on true
  where a.updated_at > now() - interval '2 days'
    and (a.pending_minor <> s.pending
         or a.available_minor <> s.available
         or a.reserved_minor <> s.reserved
         or a.frozen_minor <> s.frozen
         or a.withdrawing_minor <> s.withdrawing);

  -- 3. Lots that don't add up to the account buckets.
  select count(*) into v_lot_drift
  from public.credit_account a
  left join lateral (
    select
      coalesce(sum(l.remaining_minor) filter (where l.status = 'pending'), 0)                  as pending,
      coalesce(sum(l.remaining_minor - l.held_minor) filter (where l.status = 'active'), 0)    as free,
      coalesce(sum(l.held_minor) filter (where l.status in ('active', 'expired')), 0)          as held
    from public.credit_lot l
    where l.user_id = a.user_id and l.currency = a.currency
  ) s on true
  where a.updated_at > now() - interval '2 days'
    and a.status <> 'closed'
    and (a.pending_minor <> s.pending
         or greatest(a.available_minor, 0) <> s.free
         or (a.reserved_minor + a.frozen_minor + a.withdrawing_minor) <> s.held);

  -- 4. Lots in an impossible state.
  select count(*) into v_lot_invalid
  from public.credit_lot l
  where (l.status in ('exhausted', 'expired', 'voided', 'clawed_back', 'forfeited')
         and l.remaining_minor > l.held_minor)
     or (l.status = 'pending' and l.held_minor > 0);

  -- 5. Reservations still open long after they should have been released
  -- (the 5-minute sweep skips a payment that is processing or succeeded).
  select count(*) into v_res_stuck
  from public.credit_reservation cr
  where cr.status = 'reserved'
    and cr.expires_at < now() - interval '2 hours';

  -- 6. Captured credit that doesn't match the transaction it paid for.
  select count(*) into v_capture_mismatch
  from (
    select cr.transaction_id, sum(cr.amount_minor) as captured_minor
    from public.credit_reservation cr
    where cr.status = 'captured'
      and cr.transaction_id is not null
      and cr.captured_at > now() - interval '2 days'
    group by cr.transaction_id
  ) c
  join public.transaction t on t.id = c.transaction_id
  where public.major_to_minor(t.credit_amount, t.currency::text) <> c.captured_minor;

  return jsonb_build_object(
    'credit_unbalanced_journals', v_unbalanced,
    'credit_balance_cache_drift', v_cache_drift,
    'credit_lot_bucket_drift', v_lot_drift,
    'credit_lot_invalid_state', v_lot_invalid,
    'credit_reservation_stuck', v_res_stuck,
    'credit_capture_mismatch', v_capture_mismatch
  );
end;
$function$;
