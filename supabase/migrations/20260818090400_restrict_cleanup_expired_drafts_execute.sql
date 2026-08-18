-- Functions are PUBLIC-executable by default in Postgres. This one is
-- SECURITY DEFINER and only meant to be invoked by the pg_cron job, not
-- callable directly via PostgREST by anon/authenticated (harmless today
-- since it only removes already-expired rows, but no reason to expose it).
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_drafts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_drafts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_drafts() FROM authenticated;
