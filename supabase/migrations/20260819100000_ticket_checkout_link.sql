-- Links a ticket back to the specific ticket_checkout line item it was
-- generated from — previously there was no way to trace this (only
-- ticket_type_id + user_id, which is ambiguous across multiple checkouts of
-- the same ticket type). Needed so cancelling ONE ticket out of a
-- quantity>1 checkout line can be reflected accurately on /transactions
-- instead of either ignoring it or wrongly marking the whole line
-- cancelled. Nullable — existing tickets predate this link and stay NULL,
-- which every consumer treats as "no cancellation info available" rather
-- than an error.
alter table public.ticket
  add column ticket_checkout_id uuid references public.ticket_checkout(id) on delete set null;

create index idx_ticket_ticket_checkout_id on public.ticket (ticket_checkout_id);
