-- Field Ops Phase 3 (part 2): run_financial_reconciliation gains the two
-- Field Ops invariants. The body is otherwise unchanged from 20260910193728.
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
  v_fo_no_commission integer;
  v_fo_no_rule integer;
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

  -- 6. Field Ops: every successful onboarding has exactly one live
  -- commission, and no commission was approved without a rule behind it.
  select count(*) into v_fo_no_commission
  from public.fieldops_onboarding ob
  where ob.status = 'succeeded'
    and ob.succeeded_at < now() - interval '10 minutes'
    and not exists (
      select 1 from public.fieldops_commission c
      where c.onboarding_id = ob.id and c.reverses_commission_id is null);
  if v_fo_no_commission > 0 then
    perform public.open_reconciliation_incident(
      'fin_reconciliation.fieldops_succeeded_no_commission',
      'Field Ops onboarding(s) marked successful with no commission',
      format('%s fieldops_onboarding row(s) are succeeded but have no commission row. The sweep creates both in one transaction, so this means a manual status change. Run: select id from fieldops_onboarding ob where status=''succeeded'' and not exists (select 1 from fieldops_commission c where c.onboarding_id = ob.id and c.reverses_commission_id is null);', v_fo_no_commission),
      'high'
    );
  end if;

  select count(*) into v_fo_no_rule
  from public.fieldops_commission
  where status in ('approved', 'in_payout', 'paid')
    and reverses_commission_id is null
    and rule_id is null;
  if v_fo_no_rule > 0 then
    perform public.open_reconciliation_incident(
      'fin_reconciliation.fieldops_commission_no_rule',
      'Field Ops commission(s) payable with no rule version behind them',
      format('%s fieldops_commission row(s) are payable but carry no rule_id, so the amount cannot be traced to published terms. Investigate before paying.', v_fo_no_rule),
      'critical'
    );
  end if;

  return jsonb_build_object(
    'paid_checkout_no_earning', v_paid_no_earning,
    'succeeded_payment_no_ticket', v_succeeded_no_ticket,
    'negative_ticket_quantity', v_negative_quantity,
    'stuck_processing_payment_attempt', v_stuck_processing,
    'fieldops_succeeded_no_commission', v_fo_no_commission,
    'fieldops_commission_no_rule', v_fo_no_rule
  ) || v_credit;
end;
$$;

revoke all on function public.run_financial_reconciliation() from public, anon, authenticated;
grant execute on function public.run_financial_reconciliation() to service_role;

-- Rollback: restore the 20260910193728 definition.
