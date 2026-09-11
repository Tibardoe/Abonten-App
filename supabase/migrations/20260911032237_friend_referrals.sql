-- Abonten Rewards, Phase 5: friend referrals (invite a friend).
--
--   /invite/CODE link, a typed code, or the Android install referrer
--        │ (web: signed cookie · app: SecureStore)
--        ▼
--   referral_bind()  ── first bind wins, new accounts only, no circles ──►  user_referral
--        │                                                                  │
--        ▼                                                                  │ the friend qualifies within 60 days:
--   welcome credit for the friend (GH₵ 2, first ticket order of GH₵ 30+,   │  (1) a paid ticket order of GH₵ 30+
--   30 days) once their phone is verified                                   │  (2) their own event sells to 10 unique verified buyers
--                                                                           │  (3) an admin approves their place claim
--                                                                           ▼
--   reward_event 'friend_referral_referrer' (GH₵ 3 for the inviter) ── pending until the event
--   settles (path 3: 14 days after approval) ── re-checked, then released like event referrals.
--
-- Same engine as Phase 4: every decision is a reward_event row, risk-scored
-- and budget-gated, and SHADOW MODE records decisions without posting any
-- credit. Nothing binds unless referral capture is on AND the
-- 'friend_referral_referrer' rule has a live version; no welcome credit
-- unless 'friend_referral_referee' is live too (both ship inactive).
--
-- Also here:
--   * 'first_order' credit (welcome credit) becomes spendable: on a ticket
--     order of at least the referee rule's minimum, by someone with no paid
--     ticket order that still stands. credit_spendable takes the order total.
--   * place_claim_request: a claimant can no longer INSERT a claim that is
--     already 'approved' (the insert policy only checked the claimant id).
--     Approval stays admin-only (approve_place_claim), and path (3) above
--     also re-checks that the place really changed hands.

-- ---------------------------------------------------------------------
-- place_claim_request: claims start as pending
-- ---------------------------------------------------------------------

drop policy if exists place_claim_request_claimant_insert on public.place_claim_request;
create policy place_claim_request_claimant_insert on public.place_claim_request
  for insert
  with check (
    (select auth.uid()) = claimant_id
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

-- ---------------------------------------------------------------------
-- user_referral: who invited whom (one inviter per person, for life)
-- ---------------------------------------------------------------------

create table if not exists public.user_referral (
  referee_user_id         uuid        primary key references public.user_info (id) on delete cascade,
  referrer_user_id        uuid        not null references public.user_info (id) on delete cascade,
  code                    text        not null,
  source                  text        not null check (source in ('link', 'typed', 'install_referrer')),
  -- bound: joined, hasn't qualified yet · qualified: the inviter's reward is
  -- pending · rewarded: released · rejected: a fraud/cap decision ·
  -- expired: didn't qualify within the window.
  status                  text        not null default 'bound'
                            check (status in ('bound', 'qualified', 'rewarded', 'rejected', 'expired')),
  qualified_via           text        check (qualified_via in ('first_order', 'organizer_sales', 'place_claim')),
  qualified_at            timestamptz,
  reward_event_id         uuid        references public.reward_event (id) on delete set null,
  welcome_reward_event_id uuid        references public.reward_event (id) on delete set null,
  bound_at                timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint user_referral_not_self check (referee_user_id <> referrer_user_id)
);

create index if not exists idx_user_referral_referrer
  on public.user_referral (referrer_user_id, bound_at desc);
create index if not exists idx_user_referral_bound
  on public.user_referral (bound_at) where status = 'bound';
create index if not exists idx_user_referral_reward_event
  on public.user_referral (reward_event_id) where reward_event_id is not null;
create index if not exists idx_user_referral_welcome_event
  on public.user_referral (welcome_reward_event_id) where welcome_reward_event_id is not null;

alter table public.user_referral enable row level security;

-- The friend can see their own row (who invited them); inviters see only
-- counts and first names, through referral_stats.
create policy user_referral_referee_select on public.user_referral
  for select to authenticated
  using ((select auth.uid()) = referee_user_id);

revoke all on table public.user_referral from anon, authenticated;
grant select on table public.user_referral to authenticated;
grant all on table public.user_referral to service_role;

-- ---------------------------------------------------------------------
-- Engine tables: new sources and outbox events
-- ---------------------------------------------------------------------

alter table public.reward_event drop constraint if exists reward_event_source_type_check;
alter table public.reward_event add constraint reward_event_source_type_check
  check (source_type in ('ticket_checkout', 'user_referral', 'event', 'place_claim'));

alter table public.reward_outbox drop constraint if exists reward_outbox_event_type_check;
alter table public.reward_outbox add constraint reward_outbox_event_type_check
  check (event_type in (
    'checkout_paid', 'checkout_cancelled', 'ticket_cancelled',
    'transaction_refund', 'event_cancelled', 'event_moderated',
    'dispute_opened', 'claim_changed'));

-- ---------------------------------------------------------------------
-- Welcome credit ('first_order' scope) at checkout
-- ---------------------------------------------------------------------

-- A first ticket order: big enough, and the buyer has no paid ticket order
-- that still stands (a refunded or fully cancelled one doesn't count).
create or replace function public._credit_first_order_eligible(
  p_user_id           uuid,
  p_order_total_minor bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_order_total_minor, 0) >= coalesce((
      select r.min_basis_minor from public.reward_rule r
      where r.rule_key = 'friend_referral_referee'
      order by r.is_active desc, r.version desc
      limit 1), 3000)
    and not exists (
      select 1
      from public.ticket_checkout tc
      join public.ticket t on t.ticket_checkout_id = tc.id and t.status <> 'cancelled'
      left join public.transaction x on x.id = t.transaction_id
      where tc.user_id = p_user_id
        and tc.status = 'paid'
        and tc.total_price > 0
        and (x.id is null or x.status not in ('refund_pending', 'refunded')));
$$;

create or replace function public._credit_scopes_for_user(
  p_scope             text,
  p_user_id           uuid,
  p_order_total_minor bigint
)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_scope = 'tickets'
         and p_order_total_minor is not null
         and public._credit_first_order_eligible(p_user_id, p_order_total_minor)
      then array['any', 'tickets', 'first_order']
    else public._credit_scopes_for(p_scope)
  end;
$$;

-- Same as Phase 3, plus the order total (tickets): welcome credit only
-- counts on a first order that's big enough.
drop function if exists public.credit_spendable(uuid, text);
create or replace function public.credit_spendable(
  p_user_id           uuid,
  p_scope             text,
  p_order_total_minor bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_setting public.reward_program_setting;
  v_acct    public.credit_account;
  v_free    bigint;
  v_limits  jsonb;
begin
  select * into v_setting from public.reward_program_setting where id = 1;

  -- How much of one order credit may pay for. Promotions: all of it.
  v_limits := case p_scope
    when 'tickets' then jsonb_build_object(
      'max_share_bps', coalesce(v_setting.max_credit_share_of_ticket_order_bps, 10000),
      'allow_full_credit', coalesce(v_setting.allow_full_credit_ticket_orders, false))
    else jsonb_build_object('max_share_bps', 10000, 'allow_full_credit', true)
  end;

  if not public.rewards_enabled_for_user(p_user_id) then
    return jsonb_build_object('spendable_minor', 0, 'blocked_reason', 'program_off') || v_limits;
  end if;
  if (p_scope = 'promotions' and not v_setting.redeem_promotions_enabled)
     or (p_scope = 'tickets' and not v_setting.redeem_tickets_enabled) then
    return jsonb_build_object('spendable_minor', 0, 'blocked_reason', 'redemption_off') || v_limits;
  end if;

  select * into v_acct from public.credit_account a
  where a.user_id = p_user_id and a.currency = 'GHS';
  if not found then
    return jsonb_build_object('spendable_minor', 0, 'blocked_reason', 'no_credit') || v_limits;
  end if;
  if v_acct.status <> 'active' then
    return jsonb_build_object('spendable_minor', 0, 'blocked_reason', 'account_' || v_acct.status) || v_limits;
  end if;
  if v_acct.available_minor < 0 then
    return jsonb_build_object('spendable_minor', 0, 'blocked_reason', 'in_debt') || v_limits;
  end if;

  select coalesce(sum(l.remaining_minor - l.held_minor), 0) into v_free
  from public.credit_lot l
  where l.user_id = p_user_id
    and l.status = 'active'
    and l.remaining_minor > l.held_minor
    and l.spend_scope = any (public._credit_scopes_for_user(p_scope, p_user_id, p_order_total_minor))
    and (l.expires_at is null or l.expires_at > now());

  return jsonb_build_object(
    'spendable_minor', least(v_free, v_acct.available_minor),
    'blocked_reason', case when v_free = 0 then 'no_credit' end,
    'min_cash_charge_minor', v_setting.min_cash_charge_minor
  ) || v_limits;
end;
$$;

-- Same as Phase 2, except the eligible lots come from
-- _credit_scopes_for_user (welcome credit on a first ticket order).
create or replace function public.credit_reserve(
  p_user_id            uuid,
  p_amount_minor       bigint,
  p_order_total_minor  bigint,
  p_scope              text,
  p_target_type        text,
  p_target_id          uuid,
  p_payment_attempt_id uuid,
  p_expires_at         timestamptz,
  p_label              text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_spendable jsonb;
  v_acct      public.credit_account;
  v_existing  uuid;
  v_res       uuid;
  v_journal   uuid;
  v_scopes    text[];
  v_left      bigint := p_amount_minor;
  v_take      bigint;
  v_lots      jsonb := '[]'::jsonb;
  r           record;
begin
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Credit amount must be positive' using errcode = '22023';
  end if;
  if p_order_total_minor is null or p_order_total_minor < p_amount_minor then
    raise exception 'Credit can''t be more than the order total' using errcode = '22023';
  end if;
  if public._credit_scopes_for(p_scope) is null then
    raise exception 'Unsupported credit scope %', p_scope using errcode = '22023';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'A reservation needs a future expiry' using errcode = '22023';
  end if;

  perform public._credit_ensure_account(p_user_id);

  select * into v_acct from public.credit_account a
  where a.user_id = p_user_id and a.currency = 'GHS'
  for update;

  if p_payment_attempt_id is not null then
    select cr.id into v_existing from public.credit_reservation cr
    where cr.payment_attempt_id = p_payment_attempt_id;
    if found then
      return v_existing;
    end if;
  end if;

  -- Evaluated under the account lock, so two checkouts racing for the same
  -- credit can't both pass.
  v_scopes := public._credit_scopes_for_user(p_scope, p_user_id, p_order_total_minor);
  v_spendable := public.credit_spendable(p_user_id, p_scope, p_order_total_minor);
  if (v_spendable ->> 'blocked_reason') in ('program_off', 'redemption_off') then
    raise exception 'Paying with credit isn''t available' using errcode = '55000';
  end if;
  if (v_spendable ->> 'blocked_reason') like 'account_%' then
    raise exception 'Your credit is on hold' using errcode = '55000';
  end if;
  if (v_spendable ->> 'blocked_reason') = 'in_debt' then
    raise exception 'Your credit balance is negative' using errcode = '55000';
  end if;
  if (v_spendable ->> 'spendable_minor')::bigint < p_amount_minor then
    raise exception 'Not enough credit (spendable %, requested %)',
      v_spendable ->> 'spendable_minor', p_amount_minor
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.credit_reservation cr
    where cr.target_type = p_target_type and cr.target_id = p_target_id
      and cr.status in ('reserved', 'captured')
  ) then
    raise exception 'Credit is already applied to this checkout' using errcode = '55000';
  end if;

  insert into public.credit_reservation (
    user_id, scope, target_type, target_id, payment_attempt_id,
    amount_minor, order_total_minor, label, expires_at
  ) values (
    p_user_id, p_scope, p_target_type, p_target_id, p_payment_attempt_id,
    p_amount_minor, p_order_total_minor, p_label, p_expires_at
  )
  returning id into v_res;

  insert into public.credit_journal (
    journal_type, idempotency_key, user_id, user_delta_minor, visible_to_user,
    source_type, source_id, actor_type, actor_id, user_label
  ) values (
    'redeem.reserve', 'reserve:' || v_res, p_user_id, -p_amount_minor, false,
    p_target_type, p_target_id::text, 'user', p_user_id, p_label
  )
  returning id into v_journal;

  -- Best for the user: credit that can't be withdrawn first, then credit
  -- that only this kind of purchase can use (welcome / promotion credit
  -- before general credit), then the soonest-expiring, then the oldest.
  for r in
    select l.id, l.remaining_minor - l.held_minor as free_minor
    from public.credit_lot l
    where l.user_id = p_user_id
      and l.status = 'active'
      and l.remaining_minor > l.held_minor
      and l.spend_scope = any (v_scopes)
      and (l.expires_at is null or l.expires_at > now())
    order by l.withdrawable asc, (l.spend_scope = 'any') asc,
             l.expires_at asc nulls last, l.created_at asc, l.id asc
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.free_minor);

    update public.credit_lot l
    set held_minor = l.held_minor + v_take, updated_at = now()
    where l.id = r.id;

    perform public._credit_entry(v_journal, public._credit_user_ledger_id(p_user_id, 'available'), r.id, -v_take);
    perform public._credit_entry(v_journal, public._credit_user_ledger_id(p_user_id, 'reserved'), r.id, v_take);

    v_lots := v_lots || jsonb_build_array(jsonb_build_object('lot_id', r.id, 'amount_minor', v_take));
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    -- Unreachable after the spendable check above; kept as a hard stop.
    raise exception 'Not enough credit in eligible lots' using errcode = '23514';
  end if;

  update public.credit_reservation cr
  set lots = v_lots, reserve_journal_id = v_journal
  where cr.id = v_res;

  update public.credit_account a
  set available_minor = a.available_minor - p_amount_minor,
      reserved_minor  = a.reserved_minor + p_amount_minor,
      version         = a.version + 1,
      updated_at      = now()
  where a.user_id = p_user_id and a.currency = 'GHS';

  return v_res;
end;
$$;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- How an inviter sees a friend (and a friend sees their inviter): first
-- name and last initial, e.g. "Kofi A." -- never the full name.
create or replace function public._referral_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case
       when coalesce(trim(u.full_name), '') <> '' then
         split_part(trim(u.full_name), ' ', 1)
         || case when split_part(regexp_replace(trim(u.full_name), '\s+', ' ', 'g'), ' ', 2) <> ''
                 then ' ' || upper(left(split_part(regexp_replace(trim(u.full_name), '\s+', ' ', 'g'), ' ', 2), 1)) || '.'
                 else '' end
       when coalesce(trim(u.username), '') <> '' and not u.username_is_generated then u.username
     end
     from public.user_info u where u.id = p_user_id),
    'A friend');
$$;

-- Why this account can't be bound to an inviter now (null when it can): only
-- new accounts that haven't bought, published or claimed anything yet.
create or replace function public._referral_bind_block_reason(
  p_referee          uuid,
  p_bind_within_days integer
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.user_info u where u.id = p_referee) then 'not_found'
    when (select u.created_at from public.user_info u where u.id = p_referee)
           < now() - make_interval(days => coalesce(p_bind_within_days, 7)) then 'too_late'
    when not public._credit_first_order_eligible(p_referee, 9223372036854775807) then 'not_new'
    when exists (select 1 from public.event e
                 where e.organizer_id = p_referee and e.status in ('published', 'completed')) then 'not_new'
    when exists (select 1 from public.place_claim_request c
                 where c.claimant_id = p_referee and c.status = 'approved') then 'not_new'
  end;
$$;

-- Distinct buyers of an event who count for friend-referral path (2): paid
-- tickets that still stand, a verified phone, and no link to the organizer
-- (not the organizer, not the organizer's own inviter, not on the
-- organizer's devices).
create or replace function public._reward_event_unique_buyers(p_event_id uuid, p_organizer uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct tc.user_id)::integer
  from public.ticket_checkout tc
  join public.ticket t on t.ticket_checkout_id = tc.id and t.status <> 'cancelled'
  left join public.transaction x on x.id = t.transaction_id
  where tc.event_id = p_event_id
    and tc.status = 'paid'
    and tc.total_price > 0
    and tc.user_id is not null
    and tc.user_id <> p_organizer
    and (x.id is null or x.status not in ('refund_pending', 'refunded'))
    and tc.user_id is distinct from (
      select ur.referrer_user_id from public.user_referral ur where ur.referee_user_id = p_organizer)
    and exists (select 1 from auth.users u
                where u.id = tc.user_id and u.phone_confirmed_at is not null)
    and not exists (select 1 from public.device_install a
                    join public.device_install b on b.install_id = a.install_id
                    where a.user_id = tc.user_id and b.user_id = p_organizer);
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
      when 'shared_device'            then 60
      when 'new_buyer_account'        then 15
      when 'referrer_refund_rate'     then 40
      when 'event_concentration'      then 25
      when 'velocity'                 then 30
      when 'open_dispute'             then 80
      when 'checked_in'               then -15
      when 'bind_burst'               then 30
      when 'referrer_lifetime_review' then 30
      when 'review_threshold'         then 30
      when 'reject_threshold'         then 70
      else 0
    end);
$$;

-- ---------------------------------------------------------------------
-- Welcome credit for the invited friend
-- ---------------------------------------------------------------------

-- Grants the referee rule's welcome credit once the friend's phone is
-- verified. Recorded as a reward_event (released at once, lot scope
-- 'first_order'); in shadow mode only the record is written. Returns what
-- happened; rewards_settle_due retries 'phone_not_verified'.
create or replace function public._reward_grant_welcome(p_referee uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule     public.reward_rule;
  v_window   integer;
  v_settings public.reward_program_setting;
  v_ur       public.user_referral;
  v_key      text := 'friend_referral_referee:' || p_referee;
  v_flags    text[] := '{}';
  v_ref_auth record;
  v_me_auth  record;
  v_shadow   boolean;
  v_status   text := 'pending';
  v_reason   text;
  v_id       uuid;
begin
  select * into v_rule from public.reward_rule where rule_key = 'friend_referral_referee' and is_active;
  if not found then
    return 'rule_off';
  end if;

  select * into v_ur from public.user_referral where referee_user_id = p_referee for update;
  if not found or v_ur.status = 'rejected' or v_ur.welcome_reward_event_id is not null then
    return 'not_applicable';
  end if;
  if exists (select 1 from public.reward_event where idempotency_key = v_key) then
    return 'not_applicable';
  end if;

  select coalesce((r.caps ->> 'qualify_within_days')::integer, 60) into v_window
  from public.reward_rule r where r.rule_key = 'friend_referral_referrer'
  order by r.is_active desc, r.version desc limit 1;
  if v_ur.bound_at < now() - make_interval(days => coalesce(v_window, 60)) then
    return 'too_late';
  end if;

  if not exists (select 1 from auth.users u
                 where u.id = p_referee and u.phone_confirmed_at is not null) then
    return 'phone_not_verified';
  end if;

  select * into v_settings from public.reward_program_setting where id = 1;
  v_shadow := v_settings.shadow_mode or not public.rewards_enabled_for_user(p_referee);

  -- Welcome credit only pays for a first order; someone who has already
  -- bought gets nothing (recorded, so the sweep stops asking).
  if not public._credit_first_order_eligible(p_referee, 9223372036854775807) then
    v_status := 'rejected';
    v_reason := 'not_first_order';
  end if;

  -- Inviting yourself (same email / same device) gets no welcome credit.
  select u.email into v_me_auth from auth.users u where u.id = p_referee;
  select u.email into v_ref_auth from auth.users u where u.id = v_ur.referrer_user_id;
  if public._normalized_email(v_me_auth.email) = public._normalized_email(v_ref_auth.email) then
    v_flags := array_append(v_flags, 'same_email');
  end if;
  if exists (select 1 from public.device_install a
             join public.device_install b on b.install_id = a.install_id
             where a.user_id = p_referee and b.user_id = v_ur.referrer_user_id)
     or exists (select 1 from public.device_token a
                join public.device_token b on b.token = a.token
                where a.user_id = p_referee and b.user_id = v_ur.referrer_user_id) then
    v_flags := array_append(v_flags, 'shared_device');
  end if;
  if v_status = 'pending' and array_length(v_flags, 1) > 0 then
    v_status := 'rejected';
    v_reason := 'risk';
  end if;

  insert into public.reward_event (
    rule_key, rule_id, rule_version, beneficiary_user_id, source_type, source_id,
    buyer_user_id, idempotency_key, is_shadow, status, decision, amount_minor,
    basis, risk_score, risk_flags, status_reason, release_at
  ) values (
    'friend_referral_referee', v_rule.id, v_rule.version, p_referee, 'user_referral', p_referee,
    null, v_key, v_shadow, v_status,
    case when v_status = 'rejected' and v_reason = 'risk' then 'reject' else 'auto' end,
    case when v_status = 'rejected' then 0 else v_rule.flat_minor end,
    jsonb_build_object(
      'path', 'welcome',
      'referrer_user_id', v_ur.referrer_user_id,
      'referral_code', v_ur.code,
      'min_order_minor', v_rule.min_basis_minor,
      'expiry_days', v_rule.expiry_days),
    0, v_flags, v_reason, now()
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    return 'not_applicable';
  end if;

  update public.user_referral ur
  set welcome_reward_event_id = v_id, updated_at = now()
  where ur.referee_user_id = p_referee;

  if v_status = 'rejected' then
    return 'rejected';
  end if;

  if v_shadow then
    update public.reward_event e
    set status = 'released', released_minor = e.amount_minor, settled_at = now(), updated_at = now()
    where e.id = v_id;
    return 'shadow';
  end if;

  -- Commits the budget, grants the lot and releases it (release policy
  -- 'immediate'), and notifies the friend.
  return public._reward_accrue(v_id);
end;
$$;

-- ---------------------------------------------------------------------
-- The inviter's reward
-- ---------------------------------------------------------------------

-- Records the decision for one qualifying action of a bound friend. Caps,
-- risk and shadow mode as for event referrals. Returns the reward_event id.
create or replace function public._reward_friend_decide(
  p_referee        uuid,
  p_path           text,
  p_source_type    text,
  p_source_id      uuid,
  p_event_id       uuid,
  p_transaction_id uuid,
  p_basis          jsonb,
  p_release_at     timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
        format('%s qualified. GH₵ %s is pending for you and unlocks %s.',
               public._referral_display_name(p_referee),
               to_char(v_rule.flat_minor / 100.0, 'FM999999990.00'),
               case p_path when 'place_claim' then 'in about two weeks' else 'after the event' end));
      update public.reward_event e set notified_pending_at = now() where e.id = v_id;
    end if;
  end if;

  return v_id;
end;
$$;

-- Path (1): a paid ticket order of at least the rule's minimum.
create or replace function public._reward_friend_qualify_order(p_checkout_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  v_basis := floor(coalesce(v_tc.total_price, 0) * 100)::bigint;
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
$$;

-- Path (2): an event the friend organizes sells paid tickets to enough
-- unique, unlinked, verified buyers.
create or replace function public._reward_friend_qualify_organizer(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org       uuid;
  v_rule      public.reward_rule;
  v_threshold integer;
  v_buyers    integer;
begin
  select e.organizer_id into v_org from public.event e where e.id = p_event_id;
  if v_org is null or not exists (select 1 from public.user_referral ur
                                  where ur.referee_user_id = v_org and ur.status = 'bound') then
    return null;
  end if;

  select * into v_rule from public.reward_rule where rule_key = 'friend_referral_referrer' and is_active;
  if not found then
    return null;
  end if;

  v_threshold := coalesce((v_rule.caps ->> 'organizer_unique_buyers')::integer, 10);
  v_buyers := public._reward_event_unique_buyers(p_event_id, v_org);
  if v_buyers < v_threshold then
    return null;
  end if;

  return public._reward_friend_decide(
    v_org, 'organizer_sales', 'event', p_event_id, p_event_id, null,
    jsonb_build_object('path', 'organizer_sales', 'unique_buyers', v_buyers, 'threshold', v_threshold),
    public._event_settles_at(p_event_id));
end;
$$;

-- Path (3): an admin approved the friend's place claim (and the place
-- really is theirs now).
create or replace function public._reward_friend_qualify_claim(p_claim_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.place_claim_request;
  v_rule  public.reward_rule;
  v_days  integer;
begin
  select * into v_claim from public.place_claim_request where id = p_claim_id;
  if not found or v_claim.status <> 'approved' or v_claim.reviewed_by is null then
    return null;
  end if;
  if not exists (select 1 from public.user_referral ur
                 where ur.referee_user_id = v_claim.claimant_id and ur.status = 'bound') then
    return null;
  end if;
  if not exists (select 1 from public.place p
                 where p.id = v_claim.place_id and p.owner_id = v_claim.claimant_id) then
    return null;
  end if;
  if not exists (select 1 from public.user_info u where u.id = v_claim.reviewed_by and u.is_admin)
     and not exists (select 1 from public.admin_user au
                     where au.user_id = v_claim.reviewed_by and au.status = 'active') then
    return null;
  end if;

  select * into v_rule from public.reward_rule where rule_key = 'friend_referral_referrer' and is_active;
  if not found then
    return null;
  end if;
  v_days := coalesce((v_rule.caps ->> 'claim_release_days')::integer, 14);

  return public._reward_friend_decide(
    v_claim.claimant_id, 'place_claim', 'place_claim', p_claim_id, null, null,
    jsonb_build_object('path', 'place_claim', 'place_id', v_claim.place_id),
    coalesce(v_claim.reviewed_at, now()) + make_interval(days => v_days));
end;
$$;

-- ---------------------------------------------------------------------
-- Engine functions extended from Phase 4
-- ---------------------------------------------------------------------

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

-- Re-checks one reward against the current state of what earned it.
--   'recheck': something changed: void or hold now if needed.
--   'settle':  it's due: also release it when everything checks out.
-- Event referrals release pro rata to the tickets still valid; invite
-- rewards are all-or-nothing. Returns the resulting status.
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
  v_txn_status   text;
  v_tc_id        uuid;
  v_tc_status    text;
  v_units_total  integer := 0;
  v_units_valid  integer := 0;
  v_claim_status text;
  v_claimant     uuid;
  v_place_owner  uuid;
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
    select e.status, e.moderation_state into v_event_status, v_event_mod
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
    v_dead := case
      when v_event_status is null then 'source_missing'
      when v_event_status = 'canceled' then 'event_cancelled'
      when v_event_mod = 'removed' then 'event_removed'
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

  -- Live credit only unlocks for a referrer with a verified phone number --
  -- and for an invite, a friend with one too. Wait (checking daily) up to
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
  elsif r.source_type = 'event' then
    -- Path (2): the buyers still have to be there at settlement.
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
      settled_at = now(), updated_at = now()
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

  if r.rule_key = 'event_referral' then
    select e.title into v_label from public.event e where e.id = r.event_id;
    v_label := coalesce(v_label, 'Event referral');
    v_memo := 'Event referral reward';
  elsif r.rule_key = 'friend_referral_referrer' then
    v_label := 'inviting ' || public._referral_display_name(r.buyer_user_id);
    v_memo := 'Friend referral reward';
  elsif r.rule_key = 'friend_referral_referee' then
    v_label := format('For your first ticket order of GH₵ %s or more',
                      to_char(v_rule.min_basis_minor / 100.0, 'FM999999990.00'));
    v_memo := 'Welcome credit';
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

-- A paid checkout matters to the engine when it carries an event referral,
-- when the buyer is a friend who hasn't qualified yet, or when the event's
-- organizer is.
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
       ) then
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

create or replace function public.reward_emit_place_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and (exists (select 1 from public.user_referral ur
                  where ur.referee_user_id = new.claimant_id and ur.status = 'bound')
          or exists (select 1 from public.reward_event e where e.source_id = new.id)) then
    insert into public.reward_outbox (event_type, aggregate_id) values ('claim_changed', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists reward_emit on public.place_claim_request;
create trigger reward_emit
  after update of status on public.place_claim_request
  for each row execute function public.reward_emit_place_claim();

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
      format('GH₵ %s in Abonten Credit is ready to use.', to_char(rec.amount_minor / 100.0, 'FM999999990.00')));
  end loop;

  return jsonb_build_object('released', v_released, 'voided', v_voided,
                            'held', v_held, 'accrued_from_deferred', v_deferred,
                            'welcome_granted', v_welcome, 'invites_expired', v_expired);
end;
$$;

-- Daily digest of new pending EVENT-referral rewards (invite rewards are
-- announced as they qualify).
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
      and e.rule_key = 'event_referral'
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
-- Service entry points (called by @abonten/services after the transport
-- resolved who the caller is)
-- ---------------------------------------------------------------------

-- Binds a new account to the owner of p_code. First bind wins. Returns
-- {result, referrer_name, welcome, welcome_minor}; result is 'bound' or why
-- not: capture_off, program_off, unknown_code, own_code, already_bound,
-- too_late, not_new, circular, referrer_restricted, not_found.
create or replace function public.referral_bind(
  p_referee uuid,
  p_code    text,
  p_source  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      format('%s joined Abonten with your invite. You''ll get GH₵ %s once they buy a ticket of GH₵ %s or more.',
             public._referral_display_name(p_referee),
             to_char(coalesce(v_rule.flat_minor, 0) / 100.0, 'FM999999990.00'),
             to_char(v_rule.min_basis_minor / 100.0, 'FM999999990.00')));
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
$$;

-- The caller's invite numbers: how many friends joined / qualified, what it
-- earned, a short recent list (first name + initial only), who invited
-- them, and whether they can still enter an invite code.
create or replace function public.referral_stats(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rule        public.reward_rule;
  v_referrer    uuid;
  v_bound_at    timestamptz;
  v_block       text;
begin
  select * into v_rule from public.reward_rule where rule_key = 'friend_referral_referrer' and is_active;
  select ur.referrer_user_id, ur.bound_at into v_referrer, v_bound_at
  from public.user_referral ur where ur.referee_user_id = p_user_id;
  if v_referrer is null then
    v_block := public._referral_bind_block_reason(
      p_user_id, coalesce((v_rule.caps ->> 'bind_within_days')::integer, 7));
  end if;

  return jsonb_build_object(
    'joined', (select count(*) from public.user_referral ur where ur.referrer_user_id = p_user_id),
    'qualified', (select count(*) from public.user_referral ur
                  where ur.referrer_user_id = p_user_id and ur.status in ('qualified', 'rewarded')),
    'rewarded', (select count(*) from public.user_referral ur
                 where ur.referrer_user_id = p_user_id and ur.status = 'rewarded'),
    'earned_minor', coalesce((
      select sum(e.released_minor) from public.reward_event e
      where e.beneficiary_user_id = p_user_id and e.rule_key = 'friend_referral_referrer'
        and not e.is_shadow and e.status = 'released'), 0),
    'pending_minor', coalesce((
      select sum(e.amount_minor) from public.reward_event e
      where e.beneficiary_user_id = p_user_id and e.rule_key = 'friend_referral_referrer'
        and not e.is_shadow and e.status in ('pending', 'held', 'deferred')), 0),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'status', x.status, 'at', x.at)
                       order by x.at desc)
      from (
        select public._referral_display_name(ur.referee_user_id) as name,
               case ur.status when 'qualified' then 'qualified'
                              when 'rewarded' then 'rewarded'
                              when 'expired' then 'expired'
                              else 'joined' end as status,
               ur.bound_at as at
        from public.user_referral ur
        where ur.referrer_user_id = p_user_id
        order by ur.bound_at desc
        limit 10
      ) x), '[]'::jsonb),
    'invited_by', case when v_referrer is null then null
                       else jsonb_build_object('name', public._referral_display_name(v_referrer),
                                               'bound_at', v_bound_at) end,
    'can_bind', v_referrer is null and v_rule.id is not null and v_block is null
  );
end;
$$;

-- What the invite landing page shows for a code.
create or replace function public.referral_resolve_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ref      public.referral_code;
  v_enabled  boolean;
  v_referrer public.reward_rule;
  v_referee  public.reward_rule;
  v_avatar   record;
begin
  select * into v_ref from public.referral_code rc
  where rc.code = upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  if not found or v_ref.disabled_at is not null then
    return jsonb_build_object('valid', false);
  end if;

  select s.referral_capture_enabled into v_enabled from public.reward_program_setting s where s.id = 1;
  select * into v_referrer from public.reward_rule where rule_key = 'friend_referral_referrer' and is_active;
  select * into v_referee from public.reward_rule where rule_key = 'friend_referral_referee' and is_active;
  select u.avatar_public_id, u.avatar_version into v_avatar from public.user_info u where u.id = v_ref.user_id;

  return jsonb_build_object(
    'valid', true,
    'code', v_ref.code,
    'program_on', coalesce(v_enabled, false) and v_referrer.id is not null,
    'referrer_name', public._referral_display_name(v_ref.user_id),
    'referrer_avatar_public_id', v_avatar.avatar_public_id,
    'referrer_avatar_version', v_avatar.avatar_version,
    'welcome_minor', v_referee.flat_minor,
    'min_order_minor', coalesce(v_referee.min_basis_minor, v_referrer.min_basis_minor)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public._credit_first_order_eligible(uuid, bigint)',
    'public._credit_scopes_for_user(text, uuid, bigint)',
    'public._referral_display_name(uuid)',
    'public._referral_bind_block_reason(uuid, integer)',
    'public._reward_event_unique_buyers(uuid, uuid)',
    'public._reward_risk_weight(text, jsonb)',
    'public._reward_grant_welcome(uuid)',
    'public._reward_friend_decide(uuid, text, text, uuid, uuid, uuid, jsonb, timestamptz)',
    'public._reward_friend_qualify_order(uuid)',
    'public._reward_friend_qualify_organizer(uuid)',
    'public._reward_friend_qualify_claim(uuid)',
    'public._reward_void(uuid, text)',
    'public._reward_settle_one(uuid, text)',
    'public._reward_accrue(uuid)',
    'public._reward_dispatch(text, uuid)',
    'public.reward_emit_ticket_checkout()',
    'public.reward_emit_place_claim()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', fn);
  end loop;

  foreach fn in array array[
    'public.credit_spendable(uuid, text, bigint)',
    'public.credit_reserve(uuid, bigint, bigint, text, text, uuid, uuid, timestamptz, text)',
    'public.rewards_settle_due(integer)',
    'public.rewards_notify_pending()',
    'public.referral_bind(uuid, text, text)',
    'public.referral_stats(uuid)',
    'public.referral_resolve_code(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
