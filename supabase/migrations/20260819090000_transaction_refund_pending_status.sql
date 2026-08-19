-- A refund is asynchronous on Paystack's side (accepted -> processed/failed,
-- confirmed via the refund.processed/refund.failed webhook events — see
-- src/app/api/paystack/webhook/route.ts), the same way a charge is never
-- trusted as successful just because the initiate call returned. This adds
-- the intermediate state so `transaction.status` isn't marked `refunded`
-- until Paystack actually confirms it, matching that same principle.

alter table public.transaction
  drop constraint transaction_status_check;

alter table public.transaction
  add constraint transaction_status_check
  check (status = any (array['successful', 'pending', 'failed', 'refunded', 'refund_pending']));
