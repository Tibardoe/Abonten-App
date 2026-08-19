-- Prevents duplicate active free-event registrations ("I'm Attending") at
-- the database level. registerForFreeEvent.ts already guards this with a
-- SELECT-then-INSERT check, but that alone can't stop two concurrent
-- requests (double-click, two tabs) from both passing the check and both
-- inserting an active ticket — this index is the real guarantee.
--
-- Scoped to ticket_checkout_id IS NULL so it can never collide with the paid
-- checkout flow: generateTicket.ts always sets ticket_checkout_id on every
-- ticket it inserts (including quantity > 1 purchases, which legitimately
-- insert several rows sharing the same user_id + ticket_type_id).
-- registerForFreeEvent.ts never sets ticket_checkout_id, so this index only
-- ever constrains free registrations, which are always exactly one row per
-- request.
create unique index ticket_one_active_free_registration
  on public.ticket (user_id, ticket_type_id)
  where status = 'active' and ticket_checkout_id is null;
