-- Close client write access to the money path (owner-approved 2026-09-10).
--
-- Until now a signed-in user could, straight from the REST API with the
-- public anon key and their own session:
--   * create a promotion checkout for ANY event/place, and rewrite its price
--     and status (event_/place_promotion_checkout owner INSERT/UPDATE);
--   * create the promotion row itself for a checkout they own
--     (event_/place_promotion owner INSERT) -- i.e. feature for free;
--   * create or edit "successful" transaction rows (transaction owner
--     INSERT/UPDATE);
--   * create or edit payment attempts (payment_attempt owner INSERT/UPDATE);
--   * rewrite their pending ticket checkout's price (ticket_checkout owner
--     INSERT/UPDATE), then issue the tickets as "free" through
--     issue_tickets_for_checkout, or open a checkout at a price of their
--     choosing through create_ticket_checkout (which trusted the caller's
--     line amounts) -- reproduced on a local replay: two GH₵ 50 tickets
--     issued for nothing;
--   * edit their own ticket row (ticket_update's owner branch), e.g. set a
--     refunded, cancelled ticket back to 'active'.
--
-- After this migration those writes happen only on the server: through the
-- service-role client (whose code checks ownership and prices from the
-- promotion tier / ticket type) or SECURITY DEFINER functions. Clients keep
-- every SELECT they had. Organizers keep updating tickets for their own
-- events (check-in).

-- ── 1. Tables: drop the client write policies and revoke the grants ─────

drop policy if exists event_promotion_checkout_owner_insert on public.event_promotion_checkout;
drop policy if exists event_promotion_checkout_owner_update on public.event_promotion_checkout;
drop policy if exists place_promotion_checkout_owner_insert on public.place_promotion_checkout;
drop policy if exists place_promotion_checkout_owner_update on public.place_promotion_checkout;
drop policy if exists event_promotion_owner_insert on public.event_promotion;
drop policy if exists place_promotion_owner_insert on public.place_promotion;
drop policy if exists transaction_owner_insert on public.transaction;
drop policy if exists transaction_owner_update on public.transaction;
drop policy if exists payment_attempt_owner_insert on public.payment_attempt;
drop policy if exists payment_attempt_owner_update on public.payment_attempt;
drop policy if exists ticket_checkout_owner_insert on public.ticket_checkout;
drop policy if exists ticket_checkout_owner_update on public.ticket_checkout;

-- RLS already refuses these writes once the policies are gone; revoking the
-- privileges as well means a future permissive policy can't silently
-- reopen them.
revoke insert, update, delete, truncate on
  public.event_promotion_checkout,
  public.place_promotion_checkout,
  public.event_promotion,
  public.place_promotion,
  public.transaction,
  public.payment_attempt,
  public.ticket_checkout
from anon, authenticated;

-- ── 2. ticket: organizers only (check-in); buyers no longer edit tickets ─

drop policy if exists ticket_update on public.ticket;

create policy ticket_organizer_update on public.ticket
  for update
  using (
    exists (
      select 1
      from public.ticket_type tt
      join public.event e on e.id = tt.event_id
      where tt.id = ticket.ticket_type_id
        and e.organizer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.ticket_type tt
      join public.event e on e.id = tt.event_id
      where tt.id = ticket.ticket_type_id
        and e.organizer_id = (select auth.uid())
    )
  );

-- ── 3. Ticket checkout / issuance functions: backend only ───────────────
-- validateCheckoutCore prices every line from ticket_type (+ promo code)
-- and generateTicket drives issuance after the payment is verified; both
-- now call these with the service-role client.

revoke execute on function public.create_ticket_checkout(uuid, uuid, uuid, uuid, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_ticket_checkout(uuid, uuid, uuid, uuid, text, timestamptz, jsonb)
  to service_role;

revoke execute on function public.issue_tickets_for_checkout(uuid, uuid, uuid, jsonb, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.issue_tickets_for_checkout(uuid, uuid, uuid, jsonb, timestamptz, jsonb)
  to service_role;

-- ── 4. Stale-checkout sweeps: run with the owner's rights ───────────────
-- The app runs these as a "self-heal" before reading a checkout. As
-- SECURITY INVOKER they could no longer update the checkout tables for a
-- signed-in caller, and they never could restock ticket_type / promo_code
-- for one (those rows are organizer-only under RLS): a buyer-triggered sweep
-- expired their own stale checkout but silently skipped the restock, so the
-- units were lost. As definer they do the full sweep for anyone. They take
-- no input and only touch rows that are genuinely past their expiry, so they
-- are safe for any signed-in caller.

alter function public.expire_stale_ticket_checkouts() security definer;
alter function public.expire_stale_event_promotion_checkouts() security definer;
alter function public.expire_stale_place_promotion_checkouts() security definer;

revoke execute on function public.expire_stale_ticket_checkouts() from public, anon;
revoke execute on function public.expire_stale_event_promotion_checkouts() from public, anon;
revoke execute on function public.expire_stale_place_promotion_checkouts() from public, anon;

grant execute on function public.expire_stale_ticket_checkouts() to authenticated, service_role;
grant execute on function public.expire_stale_event_promotion_checkouts() to authenticated, service_role;
grant execute on function public.expire_stale_place_promotion_checkouts() to authenticated, service_role;
