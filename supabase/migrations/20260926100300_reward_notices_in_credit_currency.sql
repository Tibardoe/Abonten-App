-- Audit 2026-09-26: reward notices named every amount in cedis.
--
-- Seven reward functions wrote their notices with a literal "GH₵" and
-- amount / 100.0, so a reward in any other currency (or one with 0 or 3
-- decimal places) would have been announced in the wrong money, against
-- CLAUDE.md's global-platform rule. Each notice now formats its amount with
-- public.money_text(minor, currency) (20260926100200) in the reward's own
-- currency: the reward event's, the rule's, or the person's credit
-- account's. Rewards run in shadow mode in production, so no notice has
-- been sent with the old text.
--
-- Every body below is the production definition (fingerprints checked
-- against the live project on 2026-09-26) with only the notice text changed.

CREATE OR REPLACE FUNCTION public._reward_accrue(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    v_label := format('For your first ticket order of %s or more',
                      public.money_text(v_rule.min_basis_minor, r.currency));
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
        format('%s off your first ticket order of %s or more. Use it within %s days.',
               public.money_text(r.amount_minor, r.currency),
               public.money_text(v_rule.min_basis_minor, r.currency),
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
$function$;

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
    if v_organizer = v_referrer then
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

CREATE OR REPLACE FUNCTION public.referral_bind(p_referee uuid, p_code text, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_settings public.reward_program_setting;
  v_rule     public.reward_rule;
  v_ref      public.referral_code;
  v_existing uuid;
  v_block    text;
  v_cursor   uuid;
  v_status   smallint;
  v_inserted integer;
  v_shadow   boolean;
  v_welcome  text;
  i          integer;
begin
  select * into v_settings from public.reward_program_setting where id = 1;
  if not coalesce(v_settings.referral_capture_enabled, false) then
    return jsonb_build_object('result', 'capture_off');
  end if;
  select * into v_rule from public.reward_rule where rule_key = 'friend_referral_referrer' and is_active;
  if not found then
    return jsonb_build_object('result', 'program_off');
  end if;

  select * into v_ref from public.referral_code rc
  where rc.code = upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  if not found or v_ref.disabled_at is not null then
    return jsonb_build_object('result', 'unknown_code');
  end if;
  if v_ref.user_id = p_referee then
    return jsonb_build_object('result', 'own_code');
  end if;

  select ur.referrer_user_id into v_existing
  from public.user_referral ur where ur.referee_user_id = p_referee;
  if v_existing is not null then
    return jsonb_build_object('result', 'already_bound',
                              'referrer_name', public._referral_display_name(v_existing));
  end if;

  v_block := public._referral_bind_block_reason(
    p_referee, coalesce((v_rule.caps ->> 'bind_within_days')::integer, 7));
  if v_block is not null then
    return jsonb_build_object('result', v_block);
  end if;

  -- No circles: the inviter can't be someone this account invited (checked
  -- three levels up).
  v_cursor := v_ref.user_id;
  for i in 1..3 loop
    select ur.referrer_user_id into v_cursor
    from public.user_referral ur where ur.referee_user_id = v_cursor;
    exit when v_cursor is null;
    if v_cursor = p_referee then
      return jsonb_build_object('result', 'circular');
    end if;
  end loop;

  select u.status_id into v_status from public.user_info u where u.id = v_ref.user_id;
  if v_status in (2, 3)
     or exists (select 1 from public.credit_account a
                where a.user_id = v_ref.user_id and a.status <> 'active') then
    return jsonb_build_object('result', 'referrer_restricted');
  end if;

  insert into public.user_referral (referee_user_id, referrer_user_id, code, source)
  values (p_referee, v_ref.user_id, v_ref.code,
          case when p_source in ('link', 'typed', 'install_referrer') then p_source else 'link' end)
  on conflict (referee_user_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('result', 'already_bound');
  end if;

  v_shadow := v_settings.shadow_mode or not public.rewards_enabled_for_user(v_ref.user_id);
  if not v_shadow then
    perform public._reward_notify(
      v_ref.user_id, 'referral_joined', 'A friend joined with your invite',
      format('%s joined Abonten with your invite. You''ll get %s once they buy a ticket of %s or more.',
             public._referral_display_name(p_referee),
             public.money_text(coalesce(v_rule.flat_minor, 0), v_rule.currency),
             public.money_text(v_rule.min_basis_minor, v_rule.currency)));
  end if;

  -- The bind stands even if the welcome grant fails; rewards_settle_due
  -- retries it.
  begin
    v_welcome := public._reward_grant_welcome(p_referee);
  exception when others then
    raise warning 'welcome credit for % failed: %', p_referee, sqlerrm;
    v_welcome := 'error';
  end;

  return jsonb_build_object(
    'result', 'bound',
    'referrer_name', public._referral_display_name(v_ref.user_id),
    'welcome', v_welcome,
    'welcome_minor', (select r.flat_minor from public.reward_rule r
                      where r.rule_key = 'friend_referral_referee' and r.is_active));
end;
$function$;

CREATE OR REPLACE FUNCTION public.rewards_notify_pending()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  rec     record;
  v_count integer := 0;
begin
  for rec in
    select e.beneficiary_user_id as user_id, e.rule_key, e.currency, sum(e.amount_minor) as amount_minor,
           count(*) as n, array_agg(e.id) as ids
    from public.reward_event e
    where not e.is_shadow and e.status = 'pending' and e.notified_pending_at is null
      and e.rule_key in ('event_referral', 'promoter_commission')
    group by e.beneficiary_user_id, e.rule_key, e.currency
  loop
    if rec.rule_key = 'promoter_commission' then
      perform public._reward_notify(
        rec.user_id, 'commission_pending', 'You sold tickets as a promoter',
        format('%s in commission is pending from %s %s sold through your link. The organizer pays it as credit after the %s.',
               public.money_text(rec.amount_minor, rec.currency), rec.n,
               case when rec.n = 1 then 'ticket order' else 'ticket orders' end,
               case when rec.n = 1 then 'event' else 'events' end));
    else
      perform public._reward_notify(
        rec.user_id, 'reward_pending', 'You have a reward on the way',
        format('%s is pending from %s referred %s. It unlocks after the %s.',
               public.money_text(rec.amount_minor, rec.currency), rec.n,
               case when rec.n = 1 then 'ticket' else 'tickets' end,
               case when rec.n = 1 then 'event' else 'events' end));
    end if;
    update public.reward_event e set notified_pending_at = now() where e.id = any (rec.ids);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rewards_settle_due(p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id       uuid;
  v_result   text;
  v_released integer := 0;
  v_voided   integer := 0;
  v_held     integer := 0;
  v_deferred integer := 0;
  v_welcome  integer := 0;
  v_expired  integer := 0;
  v_window   integer;
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

  -- Welcome credit for invited friends who have verified their phone since
  -- they joined. One failure never blocks the rest of the run.
  if exists (select 1 from public.reward_rule r where r.rule_key = 'friend_referral_referee' and r.is_active) then
    for v_id in
      select ur.referee_user_id
      from public.user_referral ur
      join auth.users u on u.id = ur.referee_user_id and u.phone_confirmed_at is not null
      where ur.welcome_reward_event_id is null
        and ur.status in ('bound', 'qualified', 'rewarded')
        and ur.bound_at > now() - interval '90 days'
      order by ur.bound_at
      limit p_limit
    loop
      begin
        if public._reward_grant_welcome(v_id) in ('released', 'shadow') then
          v_welcome := v_welcome + 1;
        end if;
      exception when others then
        raise warning 'welcome credit for % failed: %', v_id, sqlerrm;
      end;
    end loop;
  end if;

  -- Invites that didn't qualify in time.
  select coalesce((r.caps ->> 'qualify_within_days')::integer, 60) into v_window
  from public.reward_rule r where r.rule_key = 'friend_referral_referrer'
  order by r.is_active desc, r.version desc limit 1;
  update public.user_referral ur
  set status = 'expired', updated_at = now()
  from public.user_info u
  where u.id = ur.referee_user_id
    and ur.status = 'bound'
    and u.created_at < now() - make_interval(days => coalesce(v_window, 60));
  get diagnostics v_expired = row_count;

  -- One notification per person per run.
  for rec in
    select key::uuid as user_id, value::text::bigint as amount_minor
    from jsonb_each(v_notify)
  loop
    perform public._reward_notify(
      rec.user_id, 'reward_available', 'Your credit is ready',
      format('%s in Abonten Credit is ready to use.',
             public.money_text(rec.amount_minor,
               (select a.currency from public.credit_account a where a.user_id = rec.user_id))));
  end loop;

  return jsonb_build_object('released', v_released, 'voided', v_voided,
                            'held', v_held, 'accrued_from_deferred', v_deferred,
                            'welcome_granted', v_welcome, 'invites_expired', v_expired);
end;
$function$;
