-- FIN-002 (docs/audit/01-limitations-register.md): the root cause (earning
-- insert could silently fail independent of the ticket purchase) was fixed
-- in Phase 2 by folding record_organizer_earning into the same atomic
-- issue_tickets_for_checkout transaction. This adds the safety net the
-- finding also asked for: a scheduled reconciliation that catches anomalies
-- from any OTHER path (a bug, a manual DB edit, a future regression) rather
-- than trusting the atomicity guarantee blindly forever.
--
-- Each check only looks at rows old enough (10+ minutes) that an in-flight
-- request can't be mistaken for a real anomaly. A found anomaly opens (or
-- reuses, if already open) one `incident` row per check -- deliberately not
-- one row per anomalous record, so a systemic failure produces one incident
-- to investigate instead of a flood.

create or replace function public.open_reconciliation_incident(
  p_component text,
  p_title text,
  p_summary text,
  p_severity text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.incident
    where component = p_component and status <> 'resolved'
  ) then
    insert into public.incident (title, status, severity, component, summary)
    values (p_title, 'investigating', p_severity, p_component, p_summary);
  end if;
end;
$$;

revoke all on function public.open_reconciliation_incident(text, text, text, text) from public, anon, authenticated;
grant execute on function public.open_reconciliation_incident(text, text, text, text) to service_role;

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

  -- 3. Negative ticket_type.quantity -- should be structurally impossible
  -- since DATA-002's CHECK constraint, kept as a belt-and-suspenders check
  -- in case that constraint is ever dropped or bypassed.
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

  -- 4. payment_attempt stuck in 'processing' for over an hour -- the
  -- recover_stale_payment_attempts() cron (every 5 min) should already have
  -- resolved anything stuck past 15 minutes, so this firing means that
  -- cron itself is failing, not just a single slow payment.
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

  return jsonb_build_object(
    'paid_checkout_no_earning', v_paid_no_earning,
    'succeeded_payment_no_ticket', v_succeeded_no_ticket,
    'negative_ticket_quantity', v_negative_quantity,
    'stuck_processing_payment_attempt', v_stuck_processing
  );
end;
$$;

revoke all on function public.run_financial_reconciliation() from public, anon, authenticated;
grant execute on function public.run_financial_reconciliation() to service_role;

select cron.schedule(
  'financial-reconciliation',
  '*/30 * * * *',
  $cron$select public.run_financial_reconciliation();$cron$
);
