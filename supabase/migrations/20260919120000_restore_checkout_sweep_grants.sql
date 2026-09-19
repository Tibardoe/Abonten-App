-- Follow-up to 20260919110000_audit_grants_and_realtime_publication.sql.
--
-- That migration revoked EXECUTE on the three checkout sweeps from
-- `authenticated` on the reasoning that a pg_cron job's function should be
-- callable by the scheduler only. The application, however, runs the same
-- sweep on demand as a self-heal before it reads or validates a checkout
-- (getTicketCheckoutCore, validateCheckoutCore, the pending-basket read,
-- the promotion checkout pages, ticket issuance) with the caller's own
-- session, so a stale reservation is released the moment someone looks at
-- it rather than at the next cron tick. The integration suite covers that
-- path and failed with "permission denied for function
-- expire_stale_ticket_checkouts".
--
-- The grant is restored. It is safe: each sweep is SECURITY DEFINER,
-- idempotent, touches only rows already past their expiry, takes no
-- arguments and returns no caller-specific data — running it gives a
-- signed-in person nothing the next cron run would not do anyway. The
-- trigger-function revokes from the earlier migration stand.

begin;

grant execute on function public.expire_stale_ticket_checkouts() to authenticated;
grant execute on function public.expire_stale_event_promotion_checkouts() to authenticated;
grant execute on function public.expire_stale_place_promotion_checkouts() to authenticated;

commit;
