-- The guard trigger added in 20260903204007 duplicated the pre-existing
-- protect_promo_code_privileged_columns() (SECURITY DEFINER, identical column
-- set, already attached as trigger promo_code_protect_columns). Drop the
-- duplicate — the original stays and was verified to block a non-organizer
-- changing discount_percentage while allowing the times_used CAS.

drop trigger if exists trg_promo_code_update_guard on public.promo_code;
drop function if exists public.guard_promo_code_update();
