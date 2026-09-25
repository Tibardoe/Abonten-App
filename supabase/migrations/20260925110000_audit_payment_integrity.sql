-- Full-system audit 2026-09-25: payment and payout integrity.
--
-- 1. One open payment attempt per checkout. Two concurrent "Pay" requests
--    for the same checkout could each insert an attempt (the service reads,
--    then inserts), start two provider charges, and — because issuing
--    tickets for an already-paid checkout answers "done" — keep the second
--    payment without a refund. The partial unique indexes make the second
--    insert fail; the service then reuses the winner's attempt.
-- 2. Payout requests must match the payout account's currency and the
--    currency's precision, and a suspended/banned/deleted account cannot
--    request one (its access token can outlive the ban by up to an hour).
-- 3. issue_free_ticket is called by the service only: it trusted the
--    caller's ticket code, QR and expiry, and any signed-in account could
--    call it directly.

-- 1 ------------------------------------------------------------------------
create unique index if not exists payment_attempt_one_open_per_ticket_checkout
  on public.payment_attempt (checkout_session_id)
  where checkout_session_id is not null
    and status in ('initiated', 'pending', 'processing');

create unique index if not exists payment_attempt_one_open_per_event_promotion
  on public.payment_attempt (event_promotion_checkout_id)
  where event_promotion_checkout_id is not null
    and status in ('initiated', 'pending', 'processing');

create unique index if not exists payment_attempt_one_open_per_place_promotion
  on public.payment_attempt (place_promotion_checkout_id)
  where place_promotion_checkout_id is not null
    and status in ('initiated', 'pending', 'processing');

create unique index if not exists payment_attempt_one_open_per_content_campaign
  on public.payment_attempt (content_campaign_checkout_id)
  where content_campaign_checkout_id is not null
    and status in ('initiated', 'pending', 'processing');

-- 2 ------------------------------------------------------------------------
create or replace function public.request_organizer_payout(
  p_payout_account_id uuid,
  p_amount numeric,
  p_currency text
)
returns table(payout_id uuid, reference text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_organizer_id    uuid := auth.uid();
  v_currency        text := upper(trim(p_currency));
  v_available       numeric;
  v_account_owner   uuid;
  v_account_status  text;
  v_account_currency text;
  v_status_id       smallint;
  v_payout_id       uuid;
  v_reference       text;
begin
  if v_organizer_id is null then
    raise exception 'Not authenticated';
  end if;

  select status_id into v_status_id
  from public.user_info where id = v_organizer_id;
  if v_status_id in (2, 3, 4) then
    raise exception 'Account restricted' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid payout amount';
  end if;
  -- An unknown code raises inside money_round (currency_minor_units).
  if public.money_round(p_amount, v_currency) <> p_amount then
    raise exception 'Invalid payout amount precision for %', v_currency;
  end if;

  select organizer_id, status, currency
    into v_account_owner, v_account_status, v_account_currency
  from public.payout_account
  where id = p_payout_account_id;

  if v_account_owner is null or v_account_owner <> v_organizer_id or v_account_status <> 'active' then
    raise exception 'Invalid payout account';
  end if;
  if upper(v_account_currency) <> v_currency then
    raise exception 'Invalid payout account currency';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_organizer_id::text || ':' || v_currency, 0));

  select
    coalesce(sum(le.amount) filter (
      where le.entry_type in ('earning', 'refund_adjustment', 'refund_hold', 'refund_release',
                              'promoter_commission', 'promoter_commission_reversal')
        and public.is_event_settled(le.event_id)
    ), 0)
    + coalesce(sum(le.amount) filter (where le.entry_type in ('payout_hold', 'payout_release')), 0)
  into v_available
  from public.organizer_ledger_entry le
  where le.organizer_id = v_organizer_id and le.currency = v_currency;

  if p_amount > v_available then
    raise exception 'Payout amount exceeds available balance';
  end if;

  v_reference := 'PYT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.payout (organizer_id, payout_account_id, amount, currency, reference)
  values (v_organizer_id, p_payout_account_id, p_amount, v_currency, v_reference)
  returning id into v_payout_id;

  insert into public.organizer_ledger_entry (organizer_id, payout_id, entry_type, amount, currency)
  values (v_organizer_id, v_payout_id, 'payout_hold', -1 * p_amount, v_currency);

  return query select v_payout_id, v_reference;
end;
$function$;

create or replace function public.admin_create_payout(
  p_organizer_id uuid,
  p_payout_account_id uuid,
  p_amount numeric,
  p_currency text
)
returns table(payout_id uuid, reference text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_currency        text := upper(trim(p_currency));
  v_available       numeric;
  v_account_owner   uuid;
  v_account_status  text;
  v_account_currency text;
  v_payout_id       uuid;
  v_reference       text;
begin
  if p_organizer_id is null then
    raise exception 'Organizer id is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid payout amount';
  end if;
  if public.money_round(p_amount, v_currency) <> p_amount then
    raise exception 'Invalid payout amount precision for %', v_currency;
  end if;

  select organizer_id, status, currency
    into v_account_owner, v_account_status, v_account_currency
  from public.payout_account
  where id = p_payout_account_id;

  if v_account_owner is null or v_account_owner <> p_organizer_id or v_account_status <> 'active' then
    raise exception 'Invalid payout account';
  end if;
  if upper(v_account_currency) <> v_currency then
    raise exception 'Invalid payout account currency';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organizer_id::text || ':' || v_currency, 0));

  select
    coalesce(sum(le.amount) filter (
      where le.entry_type in ('earning', 'refund_adjustment', 'refund_hold', 'refund_release',
                              'promoter_commission', 'promoter_commission_reversal')
        and public.is_event_settled(le.event_id)
    ), 0)
    + coalesce(sum(le.amount) filter (where le.entry_type in ('payout_hold', 'payout_release')), 0)
  into v_available
  from public.organizer_ledger_entry le
  where le.organizer_id = p_organizer_id and le.currency = v_currency;

  if p_amount > v_available then
    raise exception 'Payout amount exceeds available balance';
  end if;

  v_reference := 'PYT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.payout (organizer_id, payout_account_id, amount, currency, reference)
  values (p_organizer_id, p_payout_account_id, p_amount, v_currency, v_reference)
  returning id into v_payout_id;

  insert into public.organizer_ledger_entry (organizer_id, payout_id, entry_type, amount, currency)
  values (p_organizer_id, v_payout_id, 'payout_hold', -1 * p_amount, v_currency);

  return query select v_payout_id, v_reference;
end;
$function$;

-- 3 ------------------------------------------------------------------------
revoke execute on function public.issue_free_ticket(
  uuid, uuid, uuid, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.issue_free_ticket(
  uuid, uuid, uuid, text, text, text, timestamptz
) to service_role;
