-- Security hardening (S1 from the shared-backend architecture audit,
-- docs/mobile/05-security-rpc-audit.md): six SECURITY DEFINER financial
-- functions still carry Supabase's default-privileges EXECUTE grant to
-- `authenticated` (and `anon`). None of them checks the caller — each takes
-- a bare transaction / ticket_checkout id and mutates ledger, transaction
-- status, or the RLS-less platform_fee_entry table for *that* row, which is
-- not the caller's own. A shipped mobile bundle (or anyone with the public
-- anon key + a valid session) could POST /rest/v1/rpc/record_refund_hold and
-- flip an arbitrary user's `successful` transaction to `refund_pending`,
-- write negative refund_hold entries against an organizer's balance, or
-- poison platform_fee_entry with a caller-supplied processing cost.
--
-- This is a pre-existing web posture issue, not introduced by the mobile
-- app. The prerequisite code change (this same branch) moved every
-- remaining `authenticated`-role call path onto the service-role client:
--   * finalizePaystackPayment  -> record_platform_fee   (service-role)
--   * generateTicket           -> record_organizer_earning (service-role)
--   * issueRefundCore          -> record_refund_hold,
--                                 record_fee_refund_adjustment (service-role)
-- record_refund_release is already webhook-only (service-role), and
-- record_refund_adjustment has no runtime caller. So after that change no
-- `authenticated`-context path invokes any of these, and revoking the grant
-- breaks nothing.
--
-- `service_role` keeps EXECUTE: the Paystack webhook and the converted
-- service-role paths above are unaffected. REVOKE ... FROM authenticated,
-- anon is explicit (not FROM PUBLIC) because Supabase's ALTER DEFAULT
-- PRIVILEGES grants EXECUTE directly to those roles at function-creation
-- time, and REVOKE ... FROM PUBLIC does not remove a direct grant (see
-- 20260819111000 / 20260825110013 for the same gotcha).

REVOKE EXECUTE ON FUNCTION public.record_refund_hold(uuid)
  FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.record_refund_release(uuid)
  FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.record_refund_adjustment(uuid)
  FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.record_fee_refund_adjustment(uuid)
  FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.record_platform_fee(uuid, numeric)
  FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.record_organizer_earning(uuid)
  FROM authenticated, anon;
