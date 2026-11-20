-- A full refund, service fee included, after an event moves or is
-- postponed, for the payments that are refunded as a whole (2026-11-20,
-- docs/architecture/event-reschedule.md §4; the founder asked for "all of
-- Not in this version"):
--
--   * a payment partly or wholly in Abonten Credit, and a Pay small small
--     purchase (provider abonten_plan): when every ticket of the payment was
--     given back after a move (ticket.refund_includes_fee), the refund adds
--     the payment's service fee. whole_payment_fee() says how much; the
--     service splits it between cash (or the plan's parts) and credit like
--     the ticket price, and record_fee_refund_adjustment() now records the
--     fee given back (service_fee and net_revenue negative), as
--     _refund_fee_adjustment does for cash refunds;
--   * a running Pay small small plan cancelled while a move's refund window
--     is open (or the event is postponed): ended with the new reason
--     'event_moved', which gives back everything paid, fee included.
--
-- record_fee_refund_adjustment (held with Windows line endings in
-- production) and ticket_plan_release are replaced whole, each checked
-- against the definition this was written against (line endings ignored).

begin;

do $fp$
declare
  r record;
begin
  for r in
    select * from (values
      ('record_fee_refund_adjustment', '326d3eb6e4a34450c367b3648b82e9c8'),
      ('ticket_plan_release',          '26835d26022ab8adc4f0a7a637308322')
    ) as f(name, fingerprint)
  loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = r.name
        and md5(replace(p.prosrc, chr(13), '')) = r.fingerprint
    ) then
      raise exception 'fee_refunds: public.% is not the definition this migration expects', r.name;
    end if;
  end loop;
end;
$fp$;

-- ---------------------------------------------------------------------------
-- The service fee of a payment refunded as a whole. With p_require_flags,
-- only when every ticket it paid for was given back after a move (the
-- refund itself); without, the fee a holder would get back (the quote shown
-- before they choose).

create or replace function public.whole_payment_fee(
  p_transaction_id uuid,
  p_require_flags  boolean default true
)
returns numeric
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when p_require_flags and not coalesce(
      (select bool_and(t.refund_includes_fee) from public.ticket t
       where t.transaction_id = p_transaction_id), false)
      then 0
    else greatest(coalesce(
      (select f.service_fee from public.platform_fee_entry f
       where f.transaction_id = p_transaction_id and f.entry_type = 'fee'), 0), 0)
  end;
$function$;

comment on function public.whole_payment_fee(uuid, boolean) is
  'The service fee of a payment refunded as a whole (Abonten Credit, Pay small small) that comes back after the organizer moved the event (docs/architecture/event-reschedule.md). Service role only.';

-- ---------------------------------------------------------------------------
-- The fee audit row of a whole-payment refund: the fee given back too when
-- the tickets were given back after a move.

create or replace function public.record_fee_refund_adjustment(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_fee_row    public.platform_fee_entry%rowtype;
  v_refundable numeric;
  v_fee        numeric;
begin
  select * into v_fee_row
  from public.platform_fee_entry
  where transaction_id = p_transaction_id and entry_type = 'fee';

  if not found then
    return;
  end if;

  v_refundable := public.get_transaction_refundable_amount(p_transaction_id);
  -- After a move the fee comes back too (decision RS1); otherwise it is
  -- retained.
  v_fee := public.whole_payment_fee(p_transaction_id, true);

  insert into public.platform_fee_entry (
    transaction_id, event_id, entry_type,
    ticket_revenue, service_fee, total_customer_payment,
    processing_cost, net_revenue, fee_rate, currency
  ) values (
    p_transaction_id,
    v_fee_row.event_id,
    'fee_refund_adjustment',
    -1 * v_refundable,
    -1 * v_fee,
    -1 * (v_refundable + v_fee),
    0,   -- Paystack keeps its charge fee on a refund and reports no separate
         -- per-refund processing cost.
    -1 * v_fee,
    v_fee_row.fee_rate,
    v_fee_row.currency
  )
  on conflict (transaction_id)
    where entry_type = 'fee_refund_adjustment' and refund_id is null
    do nothing;
end;
$function$;

-- ---------------------------------------------------------------------------
-- A plan ended because the event moved: everything paid comes back.

alter table public.ticket_plan drop constraint if exists ticket_plan_ended_reason_check;
alter table public.ticket_plan add constraint ticket_plan_ended_reason_check
  check (ended_reason = any (array['hold_expired', 'deadline', 'buyer', 'event_cancelled',
                                   'account_closed', 'admin', 'event_moved']));

create or replace function public.ticket_plan_release(p_plan_id uuid, p_status text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  p          public.ticket_plan;
  s          public.payment_attempt;
  v_refund   bigint;
  v_kept     bigint;
  v_txn      uuid;
begin
  if p_status not in ('expired', 'lapsed', 'cancelled') then
    raise exception 'ticket_plan_release: unknown status %', p_status using errcode = '22023';
  end if;

  select * into p from public.ticket_plan where id = p_plan_id for update;
  if not found then
    raise exception 'ticket_plan_release: no plan %', p_plan_id using errcode = 'no_data_found';
  end if;

  if p.status not in ('awaiting_payment', 'active', 'settling') then
    return jsonb_build_object('outcome', 'not_open', 'plan_id', p.id, 'status', p.status);
  end if;

  if exists (
    select 1 from public.payment_attempt
    where ticket_plan_id = p.id and status = 'processing'
  ) then
    return jsonb_build_object('outcome', 'busy', 'plan_id', p.id, 'status', p.status);
  end if;

  v_txn := p.transaction_id;
  if p.status = 'settling' then
    select * into s from public.payment_attempt where id = p.settlement_attempt_id for update;
    if found then
      if s.status in ('processing', 'succeeded') then
        return jsonb_build_object('outcome', 'busy', 'plan_id', p.id, 'status', p.status);
      end if;
      update public.payment_attempt
      set status = 'cancelled',
          failure_reason = 'The plan ended before its tickets were issued',
          updated_at = now()
      where id = s.id;
      -- A settlement recorded but never issued (fulfilment failed) left a
      -- successful transaction with no tickets: it is being refunded now.
      if s.transaction_id is not null then
        v_txn := s.transaction_id;
        update public.transaction
        set status = 'refund_pending', refund_requested_at = now(), updated_at = now()
        where id = s.transaction_id and status = 'successful';
      end if;
    end if;
  end if;

  update public.payment_attempt
  set status = 'cancelled', failure_reason = 'The plan ended', updated_at = now()
  where ticket_plan_id = p.id and status in ('initiated', 'pending');

  with released as (
    update public.ticket_checkout
    set status = case when p_status = 'expired' then 'expired' else 'cancelled' end,
        updated_at = now()
    where checkout_session_id = p.checkout_session_id
      and status = 'on_plan'
    returning ticket_type_id, quantity
  )
  update public.ticket_type tt
  set quantity = tt.quantity + s2.total
  from (select ticket_type_id, sum(quantity) as total from released group by ticket_type_id) s2
  where tt.id = s2.ticket_type_id
    and tt.quantity is not null;

  v_refund := case
    when p.paid_minor = 0 then 0
    -- After the organizer moved or postponed the event, the fee comes back
    -- too (decision RS1), whatever the plan's terms say.
    when p.keep_fee_on_refund and p_reason <> 'event_moved'
      then floor(p.paid_minor::numeric * p.ticket_minor / p.total_minor)::bigint
    else p.paid_minor
  end;
  v_kept := p.paid_minor - v_refund;

  perform public._ticket_plan_allocate_refund(p.id, v_refund);

  update public.ticket_plan
  set status = p_status,
      ended_reason = p_reason,
      ended_at = now(),
      refund_minor = v_refund,
      kept_minor = v_kept,
      refund_status = case when v_refund > 0 then 'pending' else 'none' end,
      transaction_id = v_txn
  where id = p.id;

  return jsonb_build_object(
    'outcome', 'ended', 'plan_id', p.id, 'status', p_status, 'reason', p_reason,
    'user_id', p.user_id, 'event_id', p.event_id, 'currency', p.currency,
    'paid_minor', p.paid_minor, 'refund_minor', v_refund, 'kept_minor', v_kept);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Grants

do $grants$
declare
  fn text;
begin
  foreach fn in array array[
    'public.whole_payment_fee(uuid, boolean)',
    'public.record_fee_refund_adjustment(uuid)',
    'public.ticket_plan_release(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$grants$;

do $check$
begin
  if has_function_privilege('authenticated', 'public.whole_payment_fee(uuid, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.record_fee_refund_adjustment(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.ticket_plan_release(uuid, text, text)', 'execute') then
    raise exception 'migration check: the refund functions must stay service role only';
  end if;
end;
$check$;

commit;
