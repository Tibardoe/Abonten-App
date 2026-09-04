-- Phase 2 (DATA-002): move money/inventory invariants into the database as a
-- safety net alongside the existing Zod / app-layer checks. All four were
-- verified to have zero current violations before adding (NOT VALID first,
-- then VALIDATE, so the scan is explicit).

alter table public.ticket_type
  add constraint ticket_type_price_nonneg
    check (price is null or price >= 0) not valid;
alter table public.ticket_type
  add constraint ticket_type_quantity_nonneg
    check (quantity is null or quantity >= 0) not valid;
alter table public.ticket_type validate constraint ticket_type_price_nonneg;
alter table public.ticket_type validate constraint ticket_type_quantity_nonneg;

alter table public.promo_code
  add constraint promo_code_discount_pct_range
    check (discount_percentage is null or discount_percentage between 0 and 100) not valid;
alter table public.promo_code validate constraint promo_code_discount_pct_range;

alter table public.ticket_checkout
  add constraint ticket_checkout_total_price_nonneg
    check (total_price >= 0) not valid;
alter table public.ticket_checkout validate constraint ticket_checkout_total_price_nonneg;

-- ticket_code is generated in app code and assumed unique (§7.6 #4). ticket
-- is not partitioned, so a partial unique index is enough.
create unique index if not exists ticket_ticket_code_key
  on public.ticket (ticket_code) where ticket_code is not null;
