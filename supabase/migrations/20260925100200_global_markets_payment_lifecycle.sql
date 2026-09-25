-- Global markets, part 12: payment and market lifecycle hardening.
--
-- Found in the hardening audit:
--
-- 1. A charge that succeeds at the provider AFTER Abonten closed its payment
--    attempt (a mobile-money approval that arrives after the checkout
--    expired, a stale tab paying an attempt the buyer had switched away
--    from) was captured money with no order: finalizePayment refused to
--    reopen a failed/cancelled attempt, the webhook answered 503 and the
--    provider retried for days. payment_orphan_capture records every such
--    charge once (provider + reference) with the refund Abonten requested
--    for it, so the money goes back automatically and Finance can see it.
--
-- 2. A payout reported `transfer.reversed` after it had completed left the
--    payout "completed" while the money was back in Abonten's balance.
--    record_payout_reversal moves it to `reversed` and returns the amount to
--    the organizer's available balance, once.
--
-- 3. Readiness is computed before a status change, but nothing tied the
--    result to the configuration it was computed on: an edit between the
--    check and the transition could activate a market nobody had checked.
--    market.version now increases on every configuration change (the
--    market row, its providers, methods, payout rails and cities), and
--    market_transition refuses when the caller's expected version is stale.
--
-- 4. Adding a Paystack (or future provider) country meant editing the
--    adapter's built-in tables. market_payment_provider.options carries the
--    provider-specific facts for one account (channels, the card
--    verification amount, the bank-list country) so a new country is data.

-- ---------------------------------------------------------------------------
-- 1. Orphan captures
-- ---------------------------------------------------------------------------

create table if not exists public.payment_orphan_capture (
  id                      uuid primary key default gen_random_uuid(),
  provider                text not null,
  country_code            char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  provider_reference      text not null,
  provider_transaction_id text,
  payment_attempt_id      uuid references public.payment_attempt(id) on delete set null,
  user_id                 uuid references auth.users(id) on delete set null,
  amount                  numeric(17,3) not null check (amount >= 0),
  currency                char(3) not null references public.currency(code),
  attempt_status          text,
  source                  text not null check (source in ('webhook', 'verify', 'reconcile')),
  status                  text not null default 'detected'
                          check (status in ('detected', 'refund_requested', 'refund_failed', 'refunded', 'resolved')),
  refund_requested_at     timestamptz,
  refunded_at             timestamptz,
  last_error              text,
  attempts                integer not null default 0,
  resolved_by             uuid,
  resolved_at             timestamptz,
  note                    text,
  detected_at             timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint payment_orphan_capture_ref_key unique (provider, provider_reference)
);
create index if not exists payment_orphan_capture_open_idx
  on public.payment_orphan_capture (detected_at desc)
  where status in ('detected', 'refund_failed', 'refund_requested');
create index if not exists payment_orphan_capture_attempt_idx
  on public.payment_orphan_capture (payment_attempt_id);
create index if not exists payment_orphan_capture_user_idx
  on public.payment_orphan_capture (user_id);
create index if not exists payment_orphan_capture_currency_idx
  on public.payment_orphan_capture (currency);

alter table public.payment_orphan_capture enable row level security;
revoke all on table public.payment_orphan_capture from public, anon, authenticated;
grant select, insert, update on table public.payment_orphan_capture to service_role;

comment on table public.payment_orphan_capture is
  'A charge the provider captured for a payment attempt Abonten had already closed. Refunded automatically; one row per provider reference.';

-- ---------------------------------------------------------------------------
-- 2. Payout reversals
-- ---------------------------------------------------------------------------

alter table public.payout drop constraint if exists payout_status_check;
alter table public.payout add constraint payout_status_check
  check (status = any (array['processing', 'completed', 'failed', 'cancelled', 'reversed']));

create or replace function public.record_payout_reversal(p_payout_id uuid, p_reason text default null)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_payout public.payout;
begin
  select * into v_payout from public.payout where id = p_payout_id for update;
  if v_payout.id is null then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;
  if v_payout.status = 'reversed' then
    return 'reversed';
  end if;
  if v_payout.status <> 'completed' then
    raise exception 'Only a completed payout can be reversed (this one is %)', v_payout.status
      using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_payout.organizer_id::text || ':' || v_payout.currency, 0));

  update public.payout
     set status          = 'reversed',
         transfer_status = 'reversed',
         failure_reason  = coalesce(p_reason, 'Transfer reversed by the provider'),
         updated_at      = now()
   where id = p_payout_id;

  if not exists (
    select 1 from public.organizer_ledger_entry
    where payout_id = p_payout_id and entry_type = 'payout_release'
  ) then
    insert into public.organizer_ledger_entry (organizer_id, payout_id, entry_type, amount, currency)
    values (v_payout.organizer_id, p_payout_id, 'payout_release', abs(v_payout.amount), v_payout.currency);
  end if;

  return 'reversed';
end;
$$;
revoke all on function public.record_payout_reversal(uuid, text) from public, anon, authenticated;
grant execute on function public.record_payout_reversal(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Configuration version, and transitions pinned to it
-- ---------------------------------------------------------------------------

create or replace function public.bump_market_config_version()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_table_name = 'market' then
    -- Status changes go through market_transition, which bumps the version
    -- itself; everything else on the row is configuration.
    if (to_jsonb(new) - array['status', 'version', 'updated_at', 'updated_by', 'launched_at'])
       is distinct from
       (to_jsonb(old) - array['status', 'version', 'updated_at', 'updated_by', 'launched_at']) then
      new.version := old.version + 1;
    end if;
    return new;
  end if;
  update public.market
     set version = version + 1
   where country_code = coalesce(
     (case when tg_op = 'DELETE' then null else to_jsonb(new) ->> 'country_code' end),
     to_jsonb(old) ->> 'country_code');
  return null;
end;
$$;
revoke all on function public.bump_market_config_version() from public, anon, authenticated;

drop trigger if exists market_config_version on public.market;
create trigger market_config_version before update on public.market
  for each row execute function public.bump_market_config_version();

do $$
declare
  t text;
begin
  foreach t in array array['market_payment_provider', 'market_payment_method', 'market_payout_method', 'market_region'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_config_version', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.bump_market_config_version()',
      t || '_config_version', t);
  end loop;
end;
$$;

drop function if exists public.market_transition(text, text, uuid, text, boolean);

create or replace function public.market_transition(
  p_country_code     text,
  p_transition       text,
  p_actor_id         uuid,
  p_reason           text default null,
  p_readiness_ok     boolean default false,
  p_expected_version integer default null
)
  returns public.market
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_market  public.market;
  v_from    text;
  v_to      text;
  v_from_ok boolean;
begin
  select * into v_market from public.market where country_code = upper(p_country_code) for update;
  if not found then
    raise exception 'Market % not found', p_country_code using errcode = 'P0002';
  end if;

  -- The readiness report the caller holds was computed on one version of
  -- the configuration; if anything changed since, it proves nothing.
  if p_expected_version is not null and v_market.version <> p_expected_version then
    raise exception 'Market % changed while it was being checked (version % now, % checked); run the readiness checks again',
      v_market.country_code, v_market.version, p_expected_version
      using errcode = 'check_violation';
  end if;

  v_to := case p_transition
    when 'prepare'           then 'preparing'
    when 'mark_ready'        then 'ready'
    when 'activate'          then 'live'
    when 'pause'             then 'paused'
    when 'resume'            then 'live'
    when 'enter_maintenance' then 'maintenance'
    when 'exit_maintenance'  then 'live'
    when 'back_to_draft'     then 'draft'
  end;
  if v_to is null then
    raise exception 'Unknown market transition %', p_transition using errcode = '22023';
  end if;

  v_from_ok := case p_transition
    when 'prepare'           then v_market.status in ('draft', 'ready')
    when 'mark_ready'        then v_market.status = 'preparing'
    when 'activate'          then v_market.status in ('ready', 'paused')
    when 'pause'             then v_market.status in ('live', 'maintenance')
    when 'resume'            then v_market.status = 'paused'
    when 'enter_maintenance' then v_market.status = 'live'
    when 'exit_maintenance'  then v_market.status = 'maintenance'
    when 'back_to_draft'     then v_market.status in ('preparing', 'ready', 'paused')
  end;
  if not v_from_ok then
    raise exception 'Market % cannot % from status %', v_market.country_code, p_transition, v_market.status
      using errcode = 'check_violation';
  end if;

  if p_transition in ('mark_ready', 'activate', 'resume') and not coalesce(p_readiness_ok, false) then
    raise exception 'Market % has not passed its readiness checks', v_market.country_code
      using errcode = 'check_violation';
  end if;

  if v_market.is_default and v_to in ('draft', 'paused') then
    raise exception 'The default market cannot be paused or returned to draft'
      using errcode = 'check_violation';
  end if;

  v_from := v_market.status;

  update public.market
  set status      = v_to,
      launched_at = case when v_to = 'live' then coalesce(launched_at, now()) else launched_at end,
      version     = version + 1,
      updated_by  = p_actor_id
  where country_code = v_market.country_code
  returning * into v_market;

  insert into public.market_event (country_code, action, from_status, to_status, actor_id, reason)
  values (v_market.country_code, p_transition, v_from, v_to, p_actor_id, p_reason);

  return v_market;
end;
$$;
revoke all on function public.market_transition(text, text, uuid, text, boolean, integer) from public, anon, authenticated;
grant execute on function public.market_transition(text, text, uuid, text, boolean, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Provider-specific facts as data
-- ---------------------------------------------------------------------------

alter table public.market_payment_provider
  add column if not exists options jsonb not null default '{}'::jsonb;

comment on column public.market_payment_provider.options is
  'Provider facts for this account that differ by country: {"channels": [...], "cardVerificationMinor": {"NGN": 5000}, "bankCountry": "nigeria"}. Empty = the adapter''s documented defaults.';
