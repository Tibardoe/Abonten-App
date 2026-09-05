-- Admin payout operations.
--
-- The organizer withdrawal flow (request_organizer_payout) only ever
-- CREATES a payout row at status='processing' + a negative payout_hold
-- ledger entry. Nothing moved it forward, and there is no Paystack
-- transfer integration -- disbursement is a manual off-platform bank
-- transfer by finance staff. These two SECURITY DEFINER RPCs give the
-- Admin console the two missing moves, service_role only (called from
-- @abonten/services/admin/finance behind a finance.payout permission +
-- step-up re-auth + admin_audit_log).
--
--   admin_settle_payout  processing -> completed | failed | cancelled.
--                        completed keeps the hold (money is gone); failed /
--                        cancelled insert a payout_release entry that
--                        returns the reserved balance. Idempotent -- only a
--                        'processing' payout can move, and the release is
--                        written at most once per payout.
--
--   admin_create_payout  same effect as request_organizer_payout but the
--                        organizer id is an explicit parameter (no
--                        auth.uid()), so support can originate a withdrawal
--                        for an organizer. Re-verifies payout-account
--                        ownership + recomputes the available balance from
--                        the ledger exactly as request_organizer_payout does.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq) then saved
-- here as the source-of-truth copy.

create or replace function public.admin_settle_payout(
  p_payout_id uuid,
  p_status text,
  p_failure_reason text default null
)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_payout      public.payout;
  v_release_qty int;
begin
  if p_status not in ('completed', 'failed', 'cancelled') then
    raise exception 'Invalid payout status: %', p_status;
  end if;

  select * into v_payout from public.payout where id = p_payout_id for update;
  if v_payout.id is null then
    raise exception 'Payout not found';
  end if;
  if v_payout.status <> 'processing' then
    raise exception 'Payout is already %', v_payout.status;
  end if;

  update public.payout
     set status         = p_status,
         processed_at    = now(),
         failure_reason  = case when p_status = 'failed' then p_failure_reason else null end,
         updated_at      = now()
   where id = p_payout_id;

  -- failed / cancelled: return the reserved balance, once.
  if p_status in ('failed', 'cancelled') then
    select count(*) into v_release_qty
    from public.organizer_ledger_entry
    where payout_id = p_payout_id and entry_type = 'payout_release';

    if v_release_qty = 0 then
      insert into public.organizer_ledger_entry
        (organizer_id, payout_id, entry_type, amount, currency)
      values
        (v_payout.organizer_id, p_payout_id, 'payout_release',
         abs(v_payout.amount), v_payout.currency);
    end if;
  end if;

  return p_status;
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
  set search_path = ''
as $function$
declare
  v_available     numeric;
  v_account_owner uuid;
  v_account_status text;
  v_payout_id     uuid;
  v_reference     text;
begin
  if p_organizer_id is null then
    raise exception 'Organizer id is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid payout amount';
  end if;

  select organizer_id, status into v_account_owner, v_account_status
  from public.payout_account
  where id = p_payout_account_id;

  if v_account_owner is null or v_account_owner <> p_organizer_id or v_account_status <> 'active' then
    raise exception 'Invalid payout account';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organizer_id::text || ':' || p_currency, 0));

  select
    coalesce(sum(le.amount) filter (
      where le.entry_type in ('earning', 'refund_adjustment', 'refund_hold', 'refund_release')
        and public.is_event_settled(le.event_id)
    ), 0)
    + coalesce(sum(le.amount) filter (where le.entry_type in ('payout_hold', 'payout_release')), 0)
  into v_available
  from public.organizer_ledger_entry le
  where le.organizer_id = p_organizer_id and le.currency = p_currency;

  if p_amount > v_available then
    raise exception 'Payout amount exceeds available balance';
  end if;

  v_reference := 'PYT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.payout (organizer_id, payout_account_id, amount, currency, reference)
  values (p_organizer_id, p_payout_account_id, p_amount, p_currency, v_reference)
  returning id into v_payout_id;

  insert into public.organizer_ledger_entry (organizer_id, payout_id, entry_type, amount, currency)
  values (p_organizer_id, v_payout_id, 'payout_hold', -1 * p_amount, p_currency);

  return query select v_payout_id, v_reference;
end;
$function$;

revoke execute on function public.admin_settle_payout(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.admin_create_payout(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.admin_settle_payout(uuid, text, text) to service_role;
grant execute on function public.admin_create_payout(uuid, uuid, numeric, text) to service_role;
