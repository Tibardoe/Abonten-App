-- Abonten Rewards, Phase 1:
--   1. payment_dispute -- chargebacks were not tracked anywhere: the Paystack
--      webhook acknowledged and ignored every charge.dispute.* event. Rewards
--      need them (a disputed referred sale must not pay out) and so does
--      organizer finance. This records every dispute and opens one incident
--      per dispute for staff follow-up. It does not move any money.
--   2. run_financial_reconciliation gains the credit-ledger invariants from
--      credit_reconciliation_checks(). The four existing checks are kept
--      exactly as they were (base copied from the live definition).

create table public.payment_dispute (
  id                  uuid        primary key default gen_random_uuid(),
  provider            text        not null default 'paystack',
  provider_dispute_id text        not null,
  transaction_id      uuid        references public.transaction (id) on delete set null,
  provider_reference  text,
  status              text        not null,
  resolution          text,
  amount              numeric(12, 2),
  currency            varchar(3),
  last_event          text        not null,
  raw                 jsonb       not null default '{}'::jsonb,
  opened_at           timestamptz not null default now(),
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint payment_dispute_provider_id_key unique (provider, provider_dispute_id)
);

create index idx_payment_dispute_transaction on public.payment_dispute (transaction_id)
  where transaction_id is not null;
create index idx_payment_dispute_open on public.payment_dispute (opened_at)
  where resolved_at is null;

alter table public.payment_dispute enable row level security;
revoke all on table public.payment_dispute from anon, authenticated;
grant all on table public.payment_dispute to service_role;

-- Upserts one dispute from a signature-verified webhook event. Idempotent:
-- a redelivered event updates the same row. The transaction is resolved by
-- its Paystack reference when one is present.
create or replace function public.record_payment_dispute(
  p_provider_dispute_id text,
  p_provider_reference  text,
  p_event               text,
  p_status              text,
  p_resolution          text,
  p_amount_minor        bigint,
  p_currency            text,
  p_raw                 jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid;
  v_id             uuid;
  v_is_new         boolean;
  v_resolved       boolean := p_event = 'charge.dispute.resolve';
begin
  if coalesce(length(p_provider_dispute_id), 0) = 0 then
    raise exception 'Dispute id is required' using errcode = '22023';
  end if;

  if p_provider_reference is not null then
    select t.id into v_transaction_id
    from public.transaction t
    where t.paystack_reference = p_provider_reference;
  end if;

  insert into public.payment_dispute (
    provider, provider_dispute_id, transaction_id, provider_reference, status,
    resolution, amount, currency, last_event, raw, resolved_at
  ) values (
    'paystack', p_provider_dispute_id, v_transaction_id, p_provider_reference,
    coalesce(p_status, 'unknown'), p_resolution,
    case when p_amount_minor is null then null else round(p_amount_minor / 100.0, 2) end,
    p_currency, p_event, coalesce(p_raw, '{}'::jsonb),
    case when v_resolved then now() end
  )
  on conflict (provider, provider_dispute_id) do update
    set transaction_id     = coalesce(public.payment_dispute.transaction_id, excluded.transaction_id),
        provider_reference = coalesce(excluded.provider_reference, public.payment_dispute.provider_reference),
        status             = excluded.status,
        resolution         = coalesce(excluded.resolution, public.payment_dispute.resolution),
        amount             = coalesce(excluded.amount, public.payment_dispute.amount),
        currency           = coalesce(excluded.currency, public.payment_dispute.currency),
        last_event         = excluded.last_event,
        raw                = excluded.raw,
        resolved_at        = case when v_resolved
                                  then coalesce(public.payment_dispute.resolved_at, now())
                                  else public.payment_dispute.resolved_at end,
        updated_at         = now()
  returning id, (xmax = 0) into v_id, v_is_new;

  if v_is_new and not v_resolved then
    perform public.open_reconciliation_incident(
      'payments.dispute:' || v_id,
      'Paystack dispute opened',
      format('Dispute %s on reference %s (transaction %s), status %s. Respond in the Paystack dashboard before the deadline, and check any referral rewards linked to this sale.',
             p_provider_dispute_id, coalesce(p_provider_reference, 'unknown'),
             coalesce(v_transaction_id::text, 'not found'), coalesce(p_status, 'unknown')),
      'high'
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.record_payment_dispute(text, text, text, text, text, bigint, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_payment_dispute(text, text, text, text, text, bigint, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------
-- run_financial_reconciliation + credit invariants
-- ---------------------------------------------------------------------

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

  return jsonb_build_object(
    'paid_checkout_no_earning', v_paid_no_earning,
    'succeeded_payment_no_ticket', v_succeeded_no_ticket,
    'negative_ticket_quantity', v_negative_quantity,
    'stuck_processing_payment_attempt', v_stuck_processing
  ) || v_credit;
end;
$$;

revoke all on function public.run_financial_reconciliation() from public, anon, authenticated;
grant execute on function public.run_financial_reconciliation() to service_role;
