-- Team accounts: emails about a team reach its members, and a team's own
-- rewards are released (Tickets, entry and teams plan, Part 2;
-- docs/architecture/team-accounts.md §4j).
--
-- A notice written to a team is copied to the members whose role covers it
-- (trg_notification_fan_out_to_team, 20261116130000 / 20261116150000), and
-- each copy is queued for a push. The email was not: a team account's own
-- address is a placeholder on the reserved `.invalid` domain, so an email
-- queued for the team (an Abonten Rewards email: the team's promotion credit
-- from a rebate or place visits, a milestone) was skipped as "no_email" and
-- nobody heard of it by email.
--
-- Now an email queued for a team goes to each member who received a copy of
-- that notice (the copies carry data.source_notification_id): same channel
-- source, so each member's own email preferences, unsubscribe link, quiet
-- hours and "one reward email per 12 hours" apply when it is sent. The
-- team's own row is closed as 'sent_to_members'. Section 2 fixes what the
-- test of this found: a team's rewards were never released.

create or replace function public.notification_delivery_copy_to_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.team t where t.account_id = new.user_id) then
    return null;
  end if;

  -- The copies were written when the team's notice was (same transaction
  -- or moments before): look only at the members' newest notices.
  insert into public.notification_delivery (notification_id, user_id, channel, source, urgent)
  select n.id, n.user_id, 'email', new.source, new.urgent
  from public.team_member m
  join public.notification n
    on n.user_id = m.user_id
   and n.created_at >= now() - interval '10 minutes'
   and n.data ->> 'source_notification_id' = new.notification_id::text
  where m.team_id = new.user_id
    and m.status = 'active'
  on conflict (notification_id, channel) do nothing;

  update public.notification_delivery
     set status = 'skipped', detail = 'sent_to_members', finished_at = now()
   where id = new.id
     and status = 'queued';
  return null;
end;
$$;

revoke all on function public.notification_delivery_copy_to_team() from public, anon, authenticated;

drop trigger if exists trg_notification_delivery_copy_to_team on public.notification_delivery;
create trigger trg_notification_delivery_copy_to_team
  after insert on public.notification_delivery
  for each row
  when (new.channel = 'email')
  execute function public.notification_delivery_copy_to_team();

-- ---------------------------------------------------------------------------
-- 2. A team's own rewards are released, and are not farmed by its members
-- ---------------------------------------------------------------------------
-- Found while testing the emails: a reward for a team (organizer or venue
-- rebate, place-visit credit, a milestone) waited for "the beneficiary's
-- verified phone" forever, because a team account has no phone; it is met
-- when an active Owner of the active team has one (the same rule as the ID
-- check, stage 3). And a team's members counted as visitors of its own
-- place, and their ticket purchases counted towards its rebate, where the
-- organizer's own never did.

create or replace function public._reward_beneficiary_phone_ok(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from auth.users u
           where u.id = p_user_id and u.phone_confirmed_at is not null)
      or exists (
           select 1
           from public.team t
           join public.team_member m
             on m.team_id = t.account_id and m.role = 'owner' and m.status = 'active'
           join auth.users u on u.id = m.user_id and u.phone_confirmed_at is not null
           where t.account_id = p_user_id
             and t.status = 'active');
$$;

revoke all on function public._reward_beneficiary_phone_ok(uuid) from public, anon, authenticated;
grant execute on function public._reward_beneficiary_phone_ok(uuid) to service_role;

-- From 20260911104206_rewards_p8_loyalty_promoters_visits.sql, with the team rule (marked lines).
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
       not public._reward_beneficiary_phone_ok(r.beneficiary_user_id)
       or (v_friend and not exists (select 1 from auth.users u
                                    where u.id = r.buyer_user_id and u.phone_confirmed_at is not null))
     ) then
    if r.release_at < now() - interval '90 days' then
      perform public._reward_void(
        r.id,
        case when public._reward_beneficiary_phone_ok(r.beneficiary_user_id)
             then 'friend_phone_not_verified' else 'phone_not_verified' end);
      return 'voided';
    end if;
    update public.reward_event e
    set next_check_at = now() + interval '1 day',
        status_reason = case when public._reward_beneficiary_phone_ok(r.beneficiary_user_id)
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

-- From 20260911104206_rewards_p8_loyalty_promoters_visits.sql, with the team rule (marked lines).
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
    and not public._reward_organizer_linked(v_place.owner_id, v.user_id)
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

-- From 20260926100500_money_scale_per_currency.sql, with the team rule (marked lines).
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
  -- A team's active members count as its owners: their purchases, cards
  -- and look-alikes are the team's own.
  p_owners := p_owners || coalesce((
    select array_agg(m.user_id) from public.team_member m
    where m.team_id = any (p_owners) and m.status = 'active'), '{}'::uuid[]);

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

-- place_visit_record was last rewritten in place (20260924100200, the
-- place's own clock), so it is patched the same way here: a member of the
-- team that runs the place gets "own_place", as its owner does.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'place_visit_record';
  v_new := replace(v_def,
    'if v_place.owner_id = p_user_id then',
    'if public._reward_organizer_linked(v_place.owner_id, p_user_id) then');
  if v_new = v_def then
    raise exception 'migration check: place_visit_record was not patched (pattern not found)';
  end if;
  execute v_new;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Checks
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_notification_delivery_copy_to_team') then
    raise exception 'migration check: the team email trigger is missing';
  end if;
  if has_function_privilege('authenticated', 'public.notification_delivery_copy_to_team()', 'execute')
     or has_function_privilege('authenticated', 'public._reward_beneficiary_phone_ok(uuid)', 'execute') then
    raise exception 'migration check: clients may run a team email or reward helper';
  end if;
  if position('_reward_organizer_linked' in (
       select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'place_visit_record')) = 0 then
    raise exception 'migration check: place_visit_record does not know teams';
  end if;
end;
$$;
