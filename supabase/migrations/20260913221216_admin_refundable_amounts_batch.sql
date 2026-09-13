-- Admin console: the refundable amount for a whole page of transactions in
-- one call.
--
-- Finance › Refunds showed "Refundable" per row by calling
-- get_transaction_refundable_amount() once per transaction — one round trip
-- per row on every page load. This wrapper evaluates the same function, with
-- the same definition (ticket revenue only, the service fee is retained),
-- for a list of ids inside a single statement, so the list costs one round
-- trip however long the page is.
--
-- Nothing about *how much* is refundable changes here: the arithmetic stays
-- in get_transaction_refundable_amount(), which the buyer-side and admin
-- refund paths both call. This function only batches it.

create or replace function public.admin_transaction_refundable_amounts(
  p_transaction_ids uuid[]
)
  returns table (transaction_id uuid, refundable numeric)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select ids.id, public.get_transaction_refundable_amount(ids.id)
  from unnest(coalesce(p_transaction_ids, '{}'::uuid[])) as ids(id);
$$;

revoke execute on function public.admin_transaction_refundable_amounts(uuid[]) from public, anon, authenticated;
grant  execute on function public.admin_transaction_refundable_amounts(uuid[]) to service_role;

comment on function public.admin_transaction_refundable_amounts(uuid[]) is
  'Admin console only (service_role). get_transaction_refundable_amount() for each id in one statement, so a list page costs one round trip instead of one per row.';
