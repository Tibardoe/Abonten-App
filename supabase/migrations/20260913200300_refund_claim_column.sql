-- The refund claim gets its own column.
--
-- 20260913200200 keyed claim_transaction_refund() on refund_requested_at,
-- which also means "a refund was attempted" for the transaction UI. The two
-- meanings clash on the retry path: when Paystack later fails the cash part
-- of a refund (webhook refund.failed puts the transaction back to
-- 'successful'), the customer or an admin retries at once -- and the stale
-- request stamp made the claim refuse them for two minutes.
--
-- refund_claimed_at is only the in-flight lock: set by the claim, cleared
-- by issueRefundCore when the Paystack call fails and by the webhook when a
-- refund fails after being accepted. refund_requested_at keeps its meaning.

alter table public.transaction
  add column if not exists refund_claimed_at timestamptz;

create or replace function public.claim_transaction_refund(p_transaction_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.transaction t
     set refund_claimed_at = now(),
         refund_requested_at = coalesce(t.refund_requested_at, now()),
         updated_at = now()
   where t.id = p_transaction_id
     and t.status = 'successful'
     and (t.refund_claimed_at is null
          or t.refund_claimed_at < now() - interval '2 minutes')
  returning t.id into v_id;
  return v_id is not null;
end;
$$;

comment on function public.claim_transaction_refund(uuid) is
  'Compare-and-set before asking Paystack for a refund: true when this caller now owns the request, false when another request is in flight (or the transaction is not refundable). The claim is cleared when the request fails, and expires after two minutes in any case.';

create or replace function public.release_transaction_refund_claim(p_transaction_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.transaction t
     set refund_claimed_at = null
   where t.id = p_transaction_id;
$$;

revoke all on function public.release_transaction_refund_claim(uuid) from public, anon, authenticated;
grant execute on function public.release_transaction_refund_claim(uuid) to service_role;
