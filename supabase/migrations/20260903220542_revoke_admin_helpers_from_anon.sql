-- Admin Console Phase 1 — drop anon EXECUTE on the self-only helpers.
--
-- is_staff() / admin_has_permission() / admin_effective_permissions() are
-- only ever needed by an authenticated session (web "can I see this UI"
-- checks) and by RLS policies that are themselves `to authenticated`. anon
-- has no use for them (auth.uid() is null there anyway), so revoke it and
-- clear the anon_security_definer_function_executable advisory. Mirrors how
-- public.is_admin() is granted to authenticated only.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

revoke execute on function public.is_staff() from anon;
revoke execute on function public.admin_effective_permissions() from anon;
revoke execute on function public.admin_has_permission(text) from anon;
