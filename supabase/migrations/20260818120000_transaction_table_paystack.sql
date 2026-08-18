-- Repurposes the previously-unused, Flutterwave-shaped `transaction` table
-- for Paystack, the app's finalized payment gateway (see PROJECT.md §7.6 /
-- CLAUDE.md §0 for the pre-existing "DB expects Flutterwave, app never
-- implemented it" discrepancy this resolves). Table had 0 rows at the time
-- of this migration (verified), so this is a pure rename/relax with no data
-- migration needed.

alter table public.transaction
  rename column flutterwave_txn_id to paystack_reference;

alter table public.transaction
  rename constraint transaction_flutterwave_txn_id_key to transaction_paystack_reference_key;

-- This app never collects a user's phone number as a general profile
-- attribute (only optionally as part of a saved mobile money wallet, which
-- is payment-method-specific, not a user attribute) — so it can no longer
-- be guaranteed NOT NULL now that real rows are inserted here.
alter table public.transaction
  alter column phone_number drop not null;

-- Holds real PII (full_name, email) and payment data now that it's
-- actually populated — same hardening already applied to
-- payment_attempt/payment_method.
alter table public.transaction enable row level security;

create policy transaction_owner_select on public.transaction
  for select using (auth.uid() = user_id);

create policy transaction_owner_insert on public.transaction
  for insert with check (auth.uid() = user_id);

create policy transaction_owner_update on public.transaction
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
