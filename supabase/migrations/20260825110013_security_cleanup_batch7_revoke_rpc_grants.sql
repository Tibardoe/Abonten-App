-- is_admin() picked up Supabase's default-privileges auto-grant to anon at
-- creation time (same gotcha the pre-existing
-- revoke_anon_from_organizer_finance_definer_functions.sql migration
-- documents: REVOKE ... FROM PUBLIC does not remove a direct anon grant).
-- Not a real hole (anon has no auth.uid(), so is_admin() just returns
-- false for it) but closing it for consistency with the rest of this
-- schema's SECURITY DEFINER functions.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;

-- create_user_info_if_not_exists is `RETURNS trigger` -- it can only ever
-- be invoked by the auth.users insert trigger that owns it, never as a
-- direct RPC call (Postgres rejects calling a trigger function outside
-- trigger context regardless of grants). Revoking the default RPC-exposed
-- grants is pure hygiene: it clears the advisor warning without changing
-- what actually works, since direct invocation was never actually
-- possible.
REVOKE EXECUTE ON FUNCTION public.create_user_info_if_not_exists() FROM PUBLIC, anon, authenticated;
