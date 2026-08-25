-- Fixes event/place promotion fulfillment failing after a successful
-- Paystack payment ("Payment succeeded but we couldn't finish issuing
-- everything").
--
-- Root cause: 20260825105356_enable_rls_events_batch2.sql and
-- 20260825105513_enable_rls_places_batch3.sql enabled RLS on
-- event_promotion/place_promotion with only a SELECT policy -- unlike the
-- sibling tables ticket/subscription, which both got an owner-scoped INSERT
-- policy in the same RLS rollout. activateEventPromotion.ts/
-- activatePlacePromotion.ts, called via the cookie-bound (RLS-subject)
-- client on the fast client-side verify path, were getting a Postgres 42501
-- permission error on the promotion insert -- after payment was already
-- verified and recorded in `transaction`.

-- 1) The actual root-cause fix: owner-scoped INSERT policies, mirroring
--    ticket_owner_insert/subscription_owner_insert exactly. Ownership is
--    proven via the checkout row (the promotion row itself has no owner_id),
--    same pattern as every other "activation record" insert in this schema.
create policy event_promotion_owner_insert on public.event_promotion
  for insert with check (
    exists (
      select 1 from public.event_promotion_checkout epc
      where epc.id = event_promotion.promotion_checkout_id
        and epc.owner_id = (select auth.uid())
    )
  );

create policy place_promotion_owner_insert on public.place_promotion
  for insert with check (
    exists (
      select 1 from public.place_promotion_checkout ppc
      where ppc.id = place_promotion.promotion_checkout_id
        and ppc.owner_id = (select auth.uid())
    )
  );

-- 2) Defense-in-depth idempotency: the payment_attempt CAS lock already
--    prevents concurrent double-fulfillment in practice, but a unique
--    constraint makes "one promotion per checkout" a guarantee the database
--    itself enforces, matching the requirement that retried/duplicate
--    fulfillment must never create a second featured record. Application
--    code (activateEventPromotion.ts/activatePlacePromotion.ts) now treats a
--    23505 unique-violation on this constraint as "already fulfilled" rather
--    than a hard failure.
alter table public.event_promotion
  add constraint event_promotion_checkout_id_unique unique (promotion_checkout_id);

alter table public.place_promotion
  add constraint place_promotion_checkout_id_unique unique (promotion_checkout_id);

-- 3) New payment_attempt state: 'fulfillment_failed'. Distinct from 'failed'
--    (which stays reserved for a genuine Paystack decline/verification
--    failure -- a real payment failure). 'fulfillment_failed' means Paystack
--    verified the charge and a `transaction` row was recorded, but issuing
--    the purchased thing (ticket/subscription/promotion) failed afterward --
--    the payment itself succeeded and must never be re-charged. This status
--    is retry-eligible (see finalizePaystackPayment.ts's CAS lock), unlike
--    'failed'.
alter table public.payment_attempt drop constraint payment_attempt_status_check;
alter table public.payment_attempt add constraint payment_attempt_status_check
  check (status in (
    'initiated','pending','processing','succeeded','failed',
    'cancelled','refunded','fulfillment_failed'
  ));
