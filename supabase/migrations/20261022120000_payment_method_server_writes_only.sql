-- payment_method is written by the service only, as payout_account already is
-- (20260925110200) and the money tables are (20260910230109). Until now a
-- signed-in client could insert or update its own rows through the Data API,
-- which skipped the checks @abonten/services makes before a save: a card
-- token captured from a verified charge, and a mobile money number confirmed
-- by a texted code (20261021120000). Owners still read their own rows: the
-- select policies stay. anonymize_deleted_account is SECURITY DEFINER and is
-- not affected.

drop policy if exists payment_method_owner_insert on public.payment_method;
drop policy if exists payment_method_owner_update on public.payment_method;
drop policy if exists payment_method_p0_owner_insert on public.payment_method_p0;
drop policy if exists payment_method_p0_owner_update on public.payment_method_p0;
drop policy if exists payment_method_p1_owner_insert on public.payment_method_p1;
drop policy if exists payment_method_p1_owner_update on public.payment_method_p1;
drop policy if exists payment_method_p2_owner_insert on public.payment_method_p2;
drop policy if exists payment_method_p2_owner_update on public.payment_method_p2;
drop policy if exists payment_method_p3_owner_insert on public.payment_method_p3;
drop policy if exists payment_method_p3_owner_update on public.payment_method_p3;

revoke insert, update, delete, truncate on public.payment_method from anon, authenticated;
revoke insert, update, delete, truncate on public.payment_method_p0 from anon, authenticated;
revoke insert, update, delete, truncate on public.payment_method_p1 from anon, authenticated;
revoke insert, update, delete, truncate on public.payment_method_p2 from anon, authenticated;
revoke insert, update, delete, truncate on public.payment_method_p3 from anon, authenticated;
