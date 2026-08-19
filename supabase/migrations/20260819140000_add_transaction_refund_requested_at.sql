-- Distinguishes "a refund was actually requested from Paystack and failed"
-- from "no refund has been requested yet" -- both currently look identical
-- (transaction.status stays 'successful'). This becomes ambiguous once
-- cancelUserTicket.ts defers requesting a refund until every ticket sharing
-- a transaction is cancelled (a single Paystack charge can cover multiple
-- tickets/ticket types/quantities, even across a multi-event checkout --
-- see generateTicket.ts -- and Paystack's refund endpoint has no per-ticket
-- partial-amount support in this integration, so refunding must wait for
-- the whole order to be cancelled rather than refunding the full amount
-- while sibling tickets are still active).
alter table public.transaction
  add column refund_requested_at timestamptz;

comment on column public.transaction.refund_requested_at is
  'Set when issueRefund.ts actually calls Paystack''s refund endpoint for this transaction. NULL on a transaction still at status=successful with a cancelled ticket means the refund is deliberately deferred until every ticket sharing this transaction is cancelled -- not that an attempt failed.';
