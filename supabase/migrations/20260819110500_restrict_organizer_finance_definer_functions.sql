-- Postgres grants EXECUTE to PUBLIC by default on newly created functions,
-- which silently included anon here even though the previous migration only
-- explicitly GRANTed to authenticated/service_role. Each of these three
-- SECURITY DEFINER functions already no-ops or raises for an unauthenticated
-- caller (auth.uid() is null), so this was not an exploitable gap — but
-- these mutate financial ledger state, so PUBLIC execute is revoked
-- explicitly rather than left implicit, tightening this beyond the
-- repo's existing (pre-existing, out of scope) default-PUBLIC-execute gap
-- on some older functions.
REVOKE EXECUTE ON FUNCTION public.record_organizer_earning(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_refund_adjustment(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_organizer_payout(uuid, numeric, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_organizer_earning(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_organizer_earning(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_refund_adjustment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund_adjustment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_organizer_payout(uuid, numeric, text) TO authenticated;
