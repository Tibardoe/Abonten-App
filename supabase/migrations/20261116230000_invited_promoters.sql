-- Invited promoters (Part 7 of the Tickets, entry and teams plan, the first
-- slice; decisions X33 and X36, approved by the founder 2026-11-15).
--
-- An organizer who pays promoters a commission on an event
-- (event_promoter_commission, Rewards Phase 8) can now:
--   * add promoters by name, each with their own rate if they like
--     (event_promoter);
--   * say only those promoters earn ("invited promoters only", X33:
--     event_promoter_commission.invited_only);
--   * for a team: let one of its own members earn on the team's event, but
--     only when an Owner adds them (X36). Until now no member ever earned
--     (_reward_organizer_linked, 20261116200000). The organizer itself
--     never earns on its own event, and a member still never earns
--     Abonten's own referral reward on it: only the organizer's money.
--
-- event_promoter is written only by @abonten/services with the service
-- role (after the ownership and role checks); owner_approved is set by the
-- database from who added the row, so no writer can claim it.
--
-- Docs: docs/architecture/rewards-ledger.md (Phase 8, invited promoters),
-- docs/architecture/team-accounts.md §4l.

-- 1. The switch and the list ----------------------------------------------

alter table public.event_promoter_commission
  add column if not exists invited_only boolean not null default false;

comment on column public.event_promoter_commission.invited_only is
  'Only the promoters in event_promoter earn the commission (X33).';

create table if not exists public.event_promoter (
  event_id        uuid        not null references public.event(id) on delete cascade,
  promoter_id     uuid        not null references public.user_info(id) on delete cascade,
  -- Their own rate; null = the event's rate.
  rate_bps        integer     check (rate_bps between 1 and 10000),
  -- Added by the organizer or by an active Owner of the organizing team
  -- (set by the trigger below, never by a writer). A member of the team
  -- earns only with it (X36).
  owner_approved  boolean     not null default false,
  added_by        uuid        references public.user_info(id) on delete set null,
  added_at        timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  removed_at      timestamptz,
  removed_by      uuid        references public.user_info(id) on delete set null,
  primary key (event_id, promoter_id)
);

create index if not exists event_promoter_promoter_idx
  on public.event_promoter (promoter_id) where removed_at is null;
create index if not exists event_promoter_added_by_idx
  on public.event_promoter (added_by);
create index if not exists event_promoter_removed_by_idx
  on public.event_promoter (removed_by);

alter table public.event_promoter enable row level security;
revoke all on table public.event_promoter from anon, authenticated;
grant all on table public.event_promoter to service_role;

comment on table public.event_promoter is
  'Promoters an organizer added to one event (X33, X36). Service role only.';

-- 2. Who may be a promoter, and whether an Owner added them ----------------

create or replace function public.event_promoter_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organizer uuid;
begin
  select e.organizer_id into v_organizer from public.event e where e.id = new.event_id;
  if v_organizer is null then
    raise exception 'promoter:no_event';
  end if;
  if new.promoter_id = v_organizer then
    raise exception 'promoter:own_event';
  end if;
  if exists (select 1 from public.user_info u
             where u.id = new.promoter_id and u.account_kind = 'team') then
    raise exception 'promoter:team_account';
  end if;
  if tg_op = 'INSERT' or new.added_by is distinct from old.added_by then
    new.owner_approved := new.added_by is not null and (
      new.added_by = v_organizer
      or exists (select 1 from public.team_member m
                 where m.team_id = v_organizer
                   and m.user_id = new.added_by
                   and m.role = 'owner'
                   and m.status = 'active'));
  else
    new.owner_approved := old.owner_approved;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.event_promoter_guard() from public, anon, authenticated;

drop trigger if exists event_promoter_guard on public.event_promoter;
create trigger event_promoter_guard
  before insert or update on public.event_promoter
  for each row execute function public.event_promoter_guard();

-- An active promoter of the event whom the organizer or an Owner added.
create or replace function public._event_promoter_approved(p_event_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_promoter p
    where p.event_id = p_event_id
      and p.promoter_id = p_user_id
      and p.removed_at is null
      and p.owner_approved
  );
$$;

revoke all on function public._event_promoter_approved(uuid, uuid) from public, anon, authenticated;
grant execute on function public._event_promoter_approved(uuid, uuid) to service_role;

-- 3. Each promoter's figures, for the organizer's list (live only) --------

create or replace function public.promoter_commission_promoter_stats(p_event_id uuid)
returns table (
  promoter_id   uuid,
  sales         integer,
  revenue_minor bigint,
  pending_minor bigint,
  paid_minor    bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.beneficiary_user_id,
         (count(*) filter (where e.status <> 'clawed_back'))::integer,
         coalesce(sum((e.basis ->> 'ticket_revenue_minor')::bigint)
                    filter (where e.status <> 'clawed_back'), 0)::bigint,
         coalesce(sum(e.amount_minor)
                    filter (where e.status in ('pending', 'held', 'deferred')), 0)::bigint,
         coalesce(sum(e.released_minor) filter (where e.status = 'released'), 0)::bigint
  from public.reward_event e
  where e.event_id = p_event_id
    and e.rule_key = 'promoter_commission'
    and not e.is_shadow
    and e.status in ('pending', 'held', 'deferred', 'released', 'clawed_back')
  group by e.beneficiary_user_id;
$$;

revoke all on function public.promoter_commission_promoter_stats(uuid) from public, anon, authenticated;
grant execute on function public.promoter_commission_promoter_stats(uuid) to service_role;

-- 4. An "invited promoters only" offer is not shown to everyone -----------
-- The public row says "earn 10% by sharing"; with invited promoters only
-- that is true for the people on the list alone, and the services answer
-- them (getEventPromoterOfferCore reads with the service role).

drop policy if exists event_promoter_commission_select on public.event_promoter_commission;
create policy event_promoter_commission_select
  on public.event_promoter_commission for select to anon, authenticated
  using ((is_active and not invited_only)
         or exists (select 1 from public.event e
                    where e.id = event_promoter_commission.event_id
                      and e.organizer_id = (select auth.uid())));

-- 5. The organizer's commission: invited promoters, their rates, X36.
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
  v_invited_only boolean;
  v_listed    boolean := false;
  v_listed_rate integer;
  v_listed_ok boolean := false;
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
  select c.rate_bps, c.invited_only into v_rate, v_invited_only
  from public.event_promoter_commission c
  where c.event_id = v_tc.event_id and c.is_active;
  if v_rate is null then
    return null;
  end if;
  -- Invited promoters (X33, X36): a promoter the organizer added may have
  -- their own rate; with "invited promoters only" nobody else earns here.
  select p.rate_bps, p.owner_approved into v_listed_rate, v_listed_ok
  from public.event_promoter p
  where p.event_id = v_tc.event_id
    and p.promoter_id = v_tc.referrer_user_id
    and p.removed_at is null;
  v_listed := found;
  if coalesce(v_invited_only, false) and not v_listed then
    return null;
  end if;
  v_rate := coalesce(v_listed_rate, v_rate);
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
  -- A member of the organizer's team earns only when an Owner added them
  -- as a promoter of this event (X36); the organizer never does.
  if public._reward_organizer_linked(v_event.organizer_id, v_buyer)
     or (public._reward_organizer_linked(v_event.organizer_id, v_promoter)
         and not (v_listed and coalesce(v_listed_ok, false)
                  and v_promoter <> v_event.organizer_id)) then
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
      'invited', v_listed,
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

-- 6. Abonten's referral reward: never for an invited team member.
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

  -- A member of the organizer's team whom an Owner added as a promoter
  -- earns the organizer's commission on this event, never Abonten's
  -- referral reward (X36). stamp_checkout_referral lets only their link
  -- through, so this is the only way a linked referrer gets here.
  if v_referrer <> v_event.organizer_id
     and public._reward_organizer_linked(v_event.organizer_id, v_referrer)
     and public._event_promoter_approved(v_tc.event_id, v_referrer) then
    return null;
  end if;

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

-- 7. The referral stamp: an invited team member's link goes through.
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
  -- referral. A member of the organizer's team whom an Owner added as a
  -- promoter of this event is the exception (X36): their sales earn the
  -- organizer's commission (and only that, see the event referral rule).
  if public._reward_organizer_linked(v_organizer, p_user_id) then
    return 'organizer_linked';
  end if;
  if public._reward_organizer_linked(v_organizer, v_ref.user_id)
     and not (v_ref.user_id <> v_organizer
              and public._event_promoter_approved(v_event_id, v_ref.user_id)) then
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

-- 8. Checks --------------------------------------------------------------

do $$
begin
  if position('event_promoter' in pg_get_functiondef('public._reward_evaluate_promoter_commission(uuid)'::regprocedure)) = 0
     or position('_event_promoter_approved' in pg_get_functiondef('public._reward_evaluate_event_referral(uuid)'::regprocedure)) = 0
     or position('_event_promoter_approved' in pg_get_functiondef('public.stamp_checkout_referral(uuid, uuid, text, timestamptz, text)'::regprocedure)) = 0 then
    raise exception 'migration check: invited promoters are not wired into the reward rules';
  end if;
  if has_table_privilege('authenticated', 'public.event_promoter', 'select')
     or has_function_privilege('authenticated', 'public.promoter_commission_promoter_stats(uuid)', 'execute') then
    raise exception 'migration check: event_promoter must be service role only';
  end if;
end;
$$;
