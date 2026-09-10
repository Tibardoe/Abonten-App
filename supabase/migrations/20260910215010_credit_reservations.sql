-- Abonten Rewards, Phase 2: paying for promotions with Abonten Credit.
--
-- A checkout that uses credit first RESERVES it (available -> reserved, the
-- lots' held_minor goes up), then CAPTURES it once the purchase is confirmed
-- (reserved -> redemption_promotions, the lots are used up) or RELEASES it
-- when the payment fails or the checkout lapses (reserved -> available).
-- Nothing here is callable by a client: every function is service_role only,
-- and the credit_reservation row -- not the user-writable payment_attempt --
-- is what the payment path trusts for the credit amount.
--
-- Also in this migration:
--   * payment_attempt.credit_amount / credit_reservation_id and
--     transaction.credit_amount: amount keeps meaning CASH, so every
--     existing cash total and the Paystack amount check stay correct.
--   * payment_attempt_target_check restored to production's definition. In a
--     from-scratch replay 20260826090000_add_place_promotions.sql re-created
--     it without event_promotion_checkout_id (production was fixed out of
--     band), so a replayed database rejected every event-promotion payment.
--   * credit_close_account releases open reservations first.
--   * Reservation invariants added to reconciliation.
--   * pg_cron `credit-release-stale-reservations`, every 5 minutes.

-- ---------------------------------------------------------------------
-- Existing tables (additive)
-- ---------------------------------------------------------------------

alter table public.payment_attempt drop constraint if exists payment_attempt_target_check;
alter table public.payment_attempt add constraint payment_attempt_target_check check (
  ((checkout_session_id is not null)::integer
   + (subscription_checkout_id is not null)::integer
   + (place_promotion_checkout_id is not null)::integer
   + (event_promotion_checkout_id is not null)::integer) = 1
);

alter table public.payment_attempt
  add column if not exists credit_amount numeric(12,2) not null default 0,
  add column if not exists credit_reservation_id uuid;
alter table public.payment_attempt
  add constraint payment_attempt_credit_amount_check check (credit_amount >= 0);

alter table public.transaction
  add column if not exists credit_amount numeric(12,2) not null default 0;
alter table public.transaction
  add constraint transaction_credit_amount_check check (credit_amount >= 0);

-- ---------------------------------------------------------------------
-- credit_reservation
-- ---------------------------------------------------------------------

create table public.credit_reservation (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null,
  currency           varchar(3)  not null default 'GHS',
  scope              text        not null check (scope in ('promotions', 'tickets')),
  target_type        text        not null check (target_type in (
                       'event_promotion_checkout', 'place_promotion_checkout', 'ticket_payment_group')),
  target_id          uuid        not null,
  payment_attempt_id uuid,
  amount_minor       bigint      not null check (amount_minor > 0),
  -- The authoritative order total when the credit was reserved, so the
  -- payment path knows the cash it must see from Paystack without trusting
  -- the user-writable payment_attempt.amount.
  order_total_minor  bigint      not null,
  cash_minor         bigint      generated always as (order_total_minor - amount_minor) stored,
  status             text        not null default 'reserved'
                       check (status in ('reserved', 'captured', 'released')),
  -- [{"lot_id": uuid, "amount_minor": n}, ...] -- which lots the hold sits on.
  lots               jsonb       not null default '[]'::jsonb,
  label              text,
  expires_at         timestamptz not null,
  reserve_journal_id uuid        references public.credit_journal (id),
  capture_journal_id uuid        references public.credit_journal (id),
  release_journal_id uuid        references public.credit_journal (id),
  transaction_id     uuid,
  release_reason     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  captured_at        timestamptz,
  released_at        timestamptz,
  constraint credit_reservation_total_check check (order_total_minor >= amount_minor),
  constraint credit_reservation_currency_check check (currency = 'GHS')
);

create unique index credit_reservation_one_open_per_target
  on public.credit_reservation (target_type, target_id) where status = 'reserved';
create unique index credit_reservation_payment_attempt_key
  on public.credit_reservation (payment_attempt_id) where payment_attempt_id is not null;
create index idx_credit_reservation_user on public.credit_reservation (user_id, created_at desc);
create index idx_credit_reservation_open_expiry
  on public.credit_reservation (expires_at) where status = 'reserved';
create index idx_credit_reservation_transaction
  on public.credit_reservation (transaction_id) where transaction_id is not null;

alter table public.credit_reservation enable row level security;

create policy credit_reservation_owner_select on public.credit_reservation
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.credit_reservation from anon, authenticated, service_role;
grant select on table public.credit_reservation to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

create or replace function public._credit_scopes_for(p_scope text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_scope
           when 'promotions' then array['any', 'promotions']
           when 'tickets'    then array['any', 'tickets']
         end;
$$;

-- What a user could spend right now on p_scope, and why not when it's 0.
-- Program switches, account state, debt, scope and unexpired lots are all
-- decided here so the quote and the reservation can never disagree.
create or replace function public.credit_spendable(p_user_id uuid, p_scope text)
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
begin
  select * into v_setting from public.reward_program_setting where id = 1;
  if not public.rewards_enabled_for_user(p_user_id) then
    return jsonb_build_object('spendable_minor', 0, 'blocked_reason', 'program_off');
  end if;
  if (p_scope = 'promotions' and not v_setting.redeem_promotions_enabled)
     or (p_scope = 'tickets' and not v_setting.redeem_tickets_enabled) then
    return jsonb_build_object('spendable_minor', 0, 'blocked_reason', 'redemption_off');
  end if;

  select * into v_acct from public.credit_account a
  where a.user_id = p_user_id and a.currency = 'GHS';
  if not found then
    return jsonb_build_object('spendable_minor', 0, 'blocked_reason', 'no_credit');
  end if;
  if v_acct.status <> 'active' then
    return jsonb_build_object('spendable_minor', 0, 'blocked_reason', 'account_' || v_acct.status);
  end if;
  if v_acct.available_minor < 0 then
    return jsonb_build_object('spendable_minor', 0, 'blocked_reason', 'in_debt');
  end if;

  select coalesce(sum(l.remaining_minor - l.held_minor), 0) into v_free
  from public.credit_lot l
  where l.user_id = p_user_id
    and l.status = 'active'
    and l.remaining_minor > l.held_minor
    and l.spend_scope = any (public._credit_scopes_for(p_scope))
    and (l.expires_at is null or l.expires_at > now());

  return jsonb_build_object(
    'spendable_minor', least(v_free, v_acct.available_minor),
    'blocked_reason', case when v_free = 0 then 'no_credit' end,
    'min_cash_charge_minor', v_setting.min_cash_charge_minor
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Reserve / release / capture
-- ---------------------------------------------------------------------

-- Holds p_amount_minor of the user's credit for one checkout. One open
-- reservation per target; replaying the same payment attempt returns the
-- existing reservation.
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
  v_spendable := public.credit_spendable(p_user_id, p_scope);
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
  -- that only this kind of purchase can use (promotion credit before
  -- general credit), then the soonest-expiring, then the oldest.
  for r in
    select l.id, l.remaining_minor - l.held_minor as free_minor
    from public.credit_lot l
    where l.user_id = p_user_id
      and l.status = 'active'
      and l.remaining_minor > l.held_minor
      and l.spend_scope = any (public._credit_scopes_for(p_scope))
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

-- Returns a reservation's credit to the user. A no-op (false) unless the
-- reservation is still open. Credit whose lot expired while it was held
-- expires straight away.
create or replace function public.credit_release_reservation(
  p_reservation_id uuid,
  p_reason         text,
  p_actor_type     text default 'system',
  p_actor_id       uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user    uuid;
  v_res     public.credit_reservation;
  v_journal uuid;
  v_lot     jsonb;
  v_amount  bigint;
begin
  select cr.user_id into v_user from public.credit_reservation cr where cr.id = p_reservation_id;
  if v_user is null then
    raise exception 'Credit reservation not found' using errcode = 'P0002';
  end if;

  perform 1 from public.credit_account a
  where a.user_id = v_user and a.currency = 'GHS'
  for update;

  select * into v_res from public.credit_reservation cr where cr.id = p_reservation_id for update;
  if v_res.status <> 'reserved' then
    return false;
  end if;

  insert into public.credit_journal (
    journal_type, idempotency_key, user_id, user_delta_minor, visible_to_user,
    source_type, source_id, actor_type, actor_id, memo
  ) values (
    'redeem.release', 'reserve.release:' || p_reservation_id, v_user, v_res.amount_minor, false,
    v_res.target_type, v_res.target_id::text, p_actor_type, p_actor_id, p_reason
  )
  returning id into v_journal;

  for v_lot in select * from jsonb_array_elements(v_res.lots)
  loop
    v_amount := (v_lot ->> 'amount_minor')::bigint;
    update public.credit_lot l
    set held_minor = l.held_minor - v_amount, updated_at = now()
    where l.id = (v_lot ->> 'lot_id')::uuid;

    perform public._credit_entry(v_journal, public._credit_user_ledger_id(v_user, 'reserved'), (v_lot ->> 'lot_id')::uuid, -v_amount);
    perform public._credit_entry(v_journal, public._credit_user_ledger_id(v_user, 'available'), (v_lot ->> 'lot_id')::uuid, v_amount);
  end loop;

  update public.credit_reservation cr
  set status             = 'released',
      released_at        = now(),
      release_reason     = p_reason,
      release_journal_id = v_journal,
      updated_at         = now()
  where cr.id = p_reservation_id;

  update public.credit_account a
  set reserved_minor  = a.reserved_minor - v_res.amount_minor,
      available_minor = a.available_minor + v_res.amount_minor,
      version         = a.version + 1,
      updated_at      = now()
  where a.user_id = v_user and a.currency = 'GHS';

  for v_lot in select * from jsonb_array_elements(v_res.lots)
  loop
    perform public._credit_expire_lot((v_lot ->> 'lot_id')::uuid)
    from public.credit_lot l
    where l.id = (v_lot ->> 'lot_id')::uuid and l.expires_at <= now();
  end loop;

  return true;
end;
$$;

-- Spends a reservation once the purchase is confirmed. Idempotent: a
-- captured reservation returns its original journal. If the reservation had
-- already lapsed (released) but the payment still went through, the credit
-- is taken again from the user's current balance -- or the call fails with
-- 23514 when it's no longer there, and the caller must not fulfil.
create or replace function public.credit_capture_reservation(
  p_reservation_id uuid,
  p_transaction_id uuid,
  p_label          text default null
)
returns table (journal_id uuid, captured_minor bigint, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user       uuid;
  v_acct       public.credit_account;
  v_res        public.credit_reservation;
  v_journal    uuid;
  v_redemption text;
  v_lot        jsonb;
  v_amount     bigint;
  v_free       bigint;
  v_lots       jsonb := '[]'::jsonb;
  r            record;
begin
  select cr.user_id into v_user from public.credit_reservation cr where cr.id = p_reservation_id;
  if v_user is null then
    raise exception 'Credit reservation not found' using errcode = 'P0002';
  end if;

  select * into v_acct from public.credit_account a
  where a.user_id = v_user and a.currency = 'GHS'
  for update;

  select * into v_res from public.credit_reservation cr where cr.id = p_reservation_id for update;
  if v_res.status = 'captured' then
    return query select v_res.capture_journal_id, v_res.amount_minor, false;
    return;
  end if;

  v_redemption := case v_res.scope when 'promotions' then 'redemption_promotions'
                                   else 'redemption_tickets' end;

  insert into public.credit_journal (
    journal_type, idempotency_key, user_id, user_delta_minor, visible_to_user,
    source_type, source_id, actor_type, actor_id, user_label
  ) values (
    'redeem.capture', 'reserve.capture:' || p_reservation_id, v_user, -v_res.amount_minor, true,
    v_res.target_type, v_res.target_id::text, 'system', null, coalesce(p_label, v_res.label)
  )
  returning id into v_journal;

  if v_res.status = 'reserved' then
    for v_lot in select * from jsonb_array_elements(v_res.lots)
    loop
      v_amount := (v_lot ->> 'amount_minor')::bigint;
      update public.credit_lot l
      set held_minor      = l.held_minor - v_amount,
          remaining_minor = l.remaining_minor - v_amount,
          status          = case when l.remaining_minor - v_amount = 0 then 'exhausted' else l.status end,
          closed_at       = case when l.remaining_minor - v_amount = 0 then now() else l.closed_at end,
          updated_at      = now()
      where l.id = (v_lot ->> 'lot_id')::uuid;

      perform public._credit_entry(v_journal, public._credit_user_ledger_id(v_user, 'reserved'), (v_lot ->> 'lot_id')::uuid, -v_amount);
    end loop;
    v_lots := v_res.lots;

    update public.credit_account a
    set reserved_minor       = a.reserved_minor - v_res.amount_minor,
        lifetime_spent_minor = a.lifetime_spent_minor + v_res.amount_minor,
        version              = a.version + 1,
        updated_at           = now()
    where a.user_id = v_user and a.currency = 'GHS';

    -- A held lot that expired meanwhile keeps only what was captured; the
    -- rest of it expires now.
    for v_lot in select * from jsonb_array_elements(v_res.lots)
    loop
      perform public._credit_expire_lot((v_lot ->> 'lot_id')::uuid)
      from public.credit_lot l
      where l.id = (v_lot ->> 'lot_id')::uuid and l.expires_at <= now();
    end loop;
  else
    -- Released earlier (it lapsed while the payment was still in flight).
    if v_acct.status <> 'active' or v_acct.available_minor < 0 then
      raise exception 'The credit for this order is no longer available' using errcode = '23514';
    end if;
    select coalesce(sum(l.remaining_minor - l.held_minor), 0) into v_free
    from public.credit_lot l
    where l.user_id = v_user and l.status = 'active' and l.remaining_minor > l.held_minor
      and l.spend_scope = any (public._credit_scopes_for(v_res.scope));
    if least(v_free, v_acct.available_minor) < v_res.amount_minor then
      raise exception 'The credit for this order is no longer available' using errcode = '23514';
    end if;

    for r in
      select d.lot_id, d.drawn_minor
      from public._credit_draw_lots(v_user, v_res.amount_minor, null,
                                    public._credit_scopes_for(v_res.scope), 'exhausted') d
    loop
      perform public._credit_entry(v_journal, public._credit_user_ledger_id(v_user, 'available'), r.lot_id, -r.drawn_minor);
      v_lots := v_lots || jsonb_build_array(jsonb_build_object('lot_id', r.lot_id, 'amount_minor', r.drawn_minor));
    end loop;

    update public.credit_account a
    set available_minor      = a.available_minor - v_res.amount_minor,
        lifetime_spent_minor = a.lifetime_spent_minor + v_res.amount_minor,
        version              = a.version + 1,
        updated_at           = now()
    where a.user_id = v_user and a.currency = 'GHS';
  end if;

  perform public._credit_entry(v_journal, public._credit_system_ledger_id(v_redemption), null, v_res.amount_minor);

  update public.credit_reservation cr
  set status             = 'captured',
      captured_at        = now(),
      transaction_id     = p_transaction_id,
      capture_journal_id = v_journal,
      lots               = v_lots,
      updated_at         = now()
  where cr.id = p_reservation_id;

  return query select v_journal, v_res.amount_minor, true;
end;
$$;

-- Every 5 minutes: releases reservations whose payment failed or was
-- replaced, and those past their expiry -- but never while a payment is
-- being finalized ('processing') or after it succeeded.
create or replace function public.credit_release_stale_reservations(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  r       record;
begin
  for r in
    select cr.id,
           case when pa.status in ('failed', 'cancelled') then 'payment_' || pa.status
                else 'expired' end as reason
    from public.credit_reservation cr
    left join public.payment_attempt pa on pa.id = cr.payment_attempt_id
    where cr.status = 'reserved'
      and (
        pa.status in ('failed', 'cancelled')
        or (cr.expires_at < now()
            and coalesce(pa.status, 'none') not in ('processing', 'succeeded'))
      )
    order by cr.expires_at
    limit greatest(coalesce(p_limit, 500), 1)
  loop
    if public.credit_release_reservation(r.id, r.reason) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- credit_close_account: release open reservations first
-- ---------------------------------------------------------------------

create or replace function public.credit_close_account(
  p_user_id    uuid,
  p_actor_type text default 'system',
  p_actor_id   uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acct    public.credit_account;
  v_journal uuid;
  r         record;
begin
  select * into v_acct from public.credit_account a
  where a.user_id = p_user_id and a.currency = 'GHS'
  for update;
  if not found or v_acct.status = 'closed' then
    return;
  end if;

  for r in
    select cr.id from public.credit_reservation cr
    where cr.user_id = p_user_id and cr.status = 'reserved'
  loop
    perform public.credit_release_reservation(r.id, 'account_closed', p_actor_type, p_actor_id);
  end loop;

  for r in
    select l.id from public.credit_lot l
    where l.user_id = p_user_id and l.status = 'pending'
  loop
    perform public.credit_void_lot(r.id, 'close:void:' || r.id, p_actor_type, p_actor_id, 'Account closed');
  end loop;

  select * into v_acct from public.credit_account a
  where a.user_id = p_user_id and a.currency = 'GHS';

  if v_acct.available_minor <> 0 then
    insert into public.credit_journal (
      journal_type, idempotency_key, user_id, user_delta_minor, visible_to_user,
      actor_type, actor_id, memo
    ) values (
      'account.close', 'close:' || p_user_id, p_user_id, -v_acct.available_minor, false,
      p_actor_type, p_actor_id, 'Account closed: balance forfeited'
    )
    returning id into v_journal;

    if v_acct.available_minor > 0 then
      for r in
        select d.lot_id, d.drawn_minor
        from public._credit_draw_lots(p_user_id, v_acct.available_minor, null, null, 'forfeited') d
      loop
        perform public._credit_entry(v_journal, public._credit_user_ledger_id(p_user_id, 'available'), r.lot_id, -r.drawn_minor);
      end loop;
      perform public._credit_entry(v_journal, public._credit_system_ledger_id('breakage'), null, v_acct.available_minor);
    else
      -- A debt the user never repaid is written off.
      perform public._credit_entry(v_journal, public._credit_user_ledger_id(p_user_id, 'available'), null, -v_acct.available_minor);
      perform public._credit_entry(v_journal, public._credit_system_ledger_id('admin_adjustments'), null, v_acct.available_minor);
    end if;
  end if;

  update public.credit_account a
  set status                 = 'closed',
      status_reason          = 'Account deleted',
      status_changed_at      = now(),
      status_changed_by      = p_actor_id,
      available_minor        = 0,
      lifetime_expired_minor = a.lifetime_expired_minor + greatest(v_acct.available_minor, 0),
      version                = a.version + 1,
      updated_at             = now()
  where a.user_id = p_user_id and a.currency = 'GHS';
end;
$$;

-- ---------------------------------------------------------------------
-- Reconciliation: reservation invariants
-- ---------------------------------------------------------------------

create or replace function public.credit_reconciliation_checks()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
  where round(t.credit_amount * 100)::bigint <> c.captured_minor;

  return jsonb_build_object(
    'credit_unbalanced_journals', v_unbalanced,
    'credit_balance_cache_drift', v_cache_drift,
    'credit_lot_bucket_drift', v_lot_drift,
    'credit_lot_invalid_state', v_lot_invalid,
    'credit_reservation_stuck', v_res_stuck,
    'credit_capture_mismatch', v_capture_mismatch
  );
end;
$$;

create or replace function public.run_financial_reconciliation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid_no_earning integer;
  v_succeeded_no_ticket integer;
  v_negative_quantity integer;
  v_stuck_processing integer;
  v_credit jsonb;
begin
  -- 1. Paid checkout with no matching earning entry (excludes free checkouts,
  -- which never get one by design -- see issue_tickets_for_checkout).
  select count(*) into v_paid_no_earning
  from public.ticket_checkout tc
  where tc.status = 'paid'
    and coalesce(tc.total_price, 0) <> 0
    and tc.updated_at < now() - interval '10 minutes'
    and not exists (
      select 1 from public.organizer_ledger_entry le
      where le.ticket_checkout_id = tc.id and le.entry_type = 'earning'
    );
  if v_paid_no_earning > 0 then
    perform public.open_reconciliation_incident(
      'fin_reconciliation.paid_checkout_no_earning',
      'Paid checkout(s) with no organizer earning entry',
      format('%s ticket_checkout row(s) are paid but have no matching organizer_ledger_entry earning row. Run: select id from ticket_checkout where status=''paid'' and coalesce(total_price,0)<>0 and updated_at < now() - interval ''10 minutes'' and not exists (select 1 from organizer_ledger_entry le where le.ticket_checkout_id = ticket_checkout.id and le.entry_type=''earning'');', v_paid_no_earning),
      'critical'
    );
  end if;

  -- 2. Succeeded payment_attempt with no matching ticket.
  select count(*) into v_succeeded_no_ticket
  from public.payment_attempt pa
  where pa.status = 'succeeded'
    and pa.transaction_id is not null
    and pa.checkout_session_id is not null
    and pa.updated_at < now() - interval '10 minutes'
    and not exists (
      select 1 from public.ticket t where t.transaction_id = pa.transaction_id
    );
  if v_succeeded_no_ticket > 0 then
    perform public.open_reconciliation_incident(
      'fin_reconciliation.succeeded_payment_no_ticket',
      'Succeeded payment(s) with no issued ticket',
      format('%s payment_attempt row(s) succeeded but have no matching ticket. Run: select id, transaction_id from payment_attempt where status=''succeeded'' and transaction_id is not null and checkout_session_id is not null and updated_at < now() - interval ''10 minutes'' and not exists (select 1 from ticket t where t.transaction_id = payment_attempt.transaction_id);', v_succeeded_no_ticket),
      'critical'
    );
  end if;

  -- 3. Negative ticket_type.quantity.
  select count(*) into v_negative_quantity
  from public.ticket_type
  where quantity is not null and quantity < 0;
  if v_negative_quantity > 0 then
    perform public.open_reconciliation_incident(
      'fin_reconciliation.negative_ticket_quantity',
      'ticket_type with negative quantity',
      format('%s ticket_type row(s) have quantity < 0 -- this should be prevented by a CHECK constraint (DATA-002); investigate how it was bypassed.', v_negative_quantity),
      'critical'
    );
  end if;

  -- 4. payment_attempt stuck in 'processing' for over an hour.
  select count(*) into v_stuck_processing
  from public.payment_attempt
  where status = 'processing'
    and updated_at < now() - interval '1 hour';
  if v_stuck_processing > 0 then
    perform public.open_reconciliation_incident(
      'fin_reconciliation.stuck_processing_payment_attempt',
      'payment_attempt stuck in processing for over an hour',
      format('%s payment_attempt row(s) have been "processing" for over an hour -- recover_stale_payment_attempts() should have already resolved these at the 15-minute mark; check that cron is running.', v_stuck_processing),
      'high'
    );
  end if;

  -- 5. Credit ledger invariants (see credit_reconciliation_checks).
  v_credit := public.credit_reconciliation_checks();

  if (v_credit ->> 'credit_unbalanced_journals')::integer > 0 then
    perform public.open_reconciliation_incident(
      'fin_reconciliation.credit_unbalanced_journal',
      'Credit journal(s) that do not balance',
      format('%s credit journal(s) from the last 2 days have lines that do not sum to zero (or fewer than two lines). The credit_entry_balanced trigger should make this impossible -- check it still exists. Run: select journal_id, sum(amount_minor) from credit_entry group by journal_id having sum(amount_minor) <> 0;', v_credit ->> 'credit_unbalanced_journals'),
      'critical'
    );
  end if;

  if (v_credit ->> 'credit_balance_cache_drift')::integer > 0 then
    perform public.open_reconciliation_incident(
      'fin_reconciliation.credit_balance_drift',
      'Credit account balance(s) differ from the ledger',
      format('%s credit_account row(s) have cached balances that do not equal the sum of their ledger entries. The ledger is the source of truth; freeze the affected accounts and investigate before correcting.', v_credit ->> 'credit_balance_cache_drift'),
      'critical'
    );
  end if;

  if (v_credit ->> 'credit_lot_bucket_drift')::integer > 0
     or (v_credit ->> 'credit_lot_invalid_state')::integer > 0 then
    perform public.open_reconciliation_incident(
      'fin_reconciliation.credit_lot_drift',
      'Credit lots do not add up to account balances',
      format('%s account(s) whose lots disagree with their balances, %s lot(s) in an impossible state.', v_credit ->> 'credit_lot_bucket_drift', v_credit ->> 'credit_lot_invalid_state'),
      'high'
    );
  end if;

  if (v_credit ->> 'credit_reservation_stuck')::integer > 0
     or (v_credit ->> 'credit_capture_mismatch')::integer > 0 then
    perform public.open_reconciliation_incident(
      'fin_reconciliation.credit_reservation',
      'Credit reservations need attention',
      format('%s reservation(s) still held more than 2 hours past expiry (usually a payment stuck in processing or a failed capture), %s transaction(s) whose credit_amount differs from the credit captured for them. Run: select id, payment_attempt_id, status, expires_at from credit_reservation where status = ''reserved'' and expires_at < now() - interval ''2 hours'';', v_credit ->> 'credit_reservation_stuck', v_credit ->> 'credit_capture_mismatch'),
      'high'
    );
  end if;

  return jsonb_build_object(
    'paid_checkout_no_earning', v_paid_no_earning,
    'succeeded_payment_no_ticket', v_succeeded_no_ticket,
    'negative_ticket_quantity', v_negative_quantity,
    'stuck_processing_payment_attempt', v_stuck_processing
  ) || v_credit;
end;
$$;

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------

revoke all on function public._credit_scopes_for(text) from public, anon, authenticated, service_role;
revoke all on function public.credit_spendable(uuid, text) from public, anon, authenticated;
revoke all on function public.credit_reserve(uuid, bigint, bigint, text, text, uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.credit_release_reservation(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.credit_capture_reservation(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.credit_release_stale_reservations(integer) from public, anon, authenticated;
revoke all on function public.credit_close_account(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.credit_reconciliation_checks() from public, anon, authenticated;
revoke all on function public.run_financial_reconciliation() from public, anon, authenticated;

grant execute on function public.credit_spendable(uuid, text) to service_role;
grant execute on function public.credit_reserve(uuid, bigint, bigint, text, text, uuid, uuid, timestamptz, text) to service_role;
grant execute on function public.credit_release_reservation(uuid, text, text, uuid) to service_role;
grant execute on function public.credit_capture_reservation(uuid, uuid, text) to service_role;
grant execute on function public.credit_release_stale_reservations(integer) to service_role;
grant execute on function public.credit_close_account(uuid, text, uuid) to service_role;
grant execute on function public.credit_reconciliation_checks() to service_role;
grant execute on function public.run_financial_reconciliation() to service_role;

select cron.schedule(
  'credit-release-stale-reservations',
  '*/5 * * * *',
  $cron$select public.credit_release_stale_reservations(500);$cron$
);
