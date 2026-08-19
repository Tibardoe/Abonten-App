-- Supabase applies ALTER DEFAULT PRIVILEGES that directly grants EXECUTE to
-- anon (and authenticated/service_role) on every new function in this
-- schema at creation time — confirmed project-wide, not something this
-- feature introduced (even expire_stale_ticket_checkouts, which an earlier
-- migration's comment says was deliberately restricted to exclude anon,
-- still carries an anon grant today). REVOKE ... FROM PUBLIC does not
-- remove that direct grant, only an inherited one, so it must be revoked
-- from anon explicitly. Scoped only to the three functions this feature
-- added; the pre-existing project-wide default-privileges behavior itself
-- is out of scope here.
REVOKE EXECUTE ON FUNCTION public.record_organizer_earning(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_refund_adjustment(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_organizer_payout(uuid, numeric, text) FROM anon;
