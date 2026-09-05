-- Admin Console Phase 1 — let privileged backends change user_info.is_admin /
-- status_id.
--
-- protect_user_info_privileged_columns() (added in the 2026-09-03 hardening
-- pass) blocks ANY change to user_info.is_admin / status_id unless
-- public.is_admin() is true for the CURRENT auth.uid(). That is right for a
-- normal user session, but it also blocks two legitimate Admin Console
-- paths:
--
--   1. sync_is_admin_from_admin_user() — the trigger that mirrors an active
--      admin_user row into user_info.is_admin. It runs inside the admin_user
--      write, whose session is service_role (or postgres during a
--      migration), not a signed-in admin.
--   2. setUserStatusCore() in @abonten/services/admin — an authorized admin
--      suspends/bans a user; the write runs on the SERVICE-ROLE client
--      (app-layer resolveAdminContext() already authorized the human), where
--      auth.uid() is null so is_admin() is false.
--
-- Fix: also allow the write when the effective role is service_role, or when
-- run by a superuser / the postgres role (migrations, dashboard, SECURITY
-- DEFINER maintenance). No new capability for end users — a browser/anon/
-- authenticated session still can't touch these columns.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

create or replace function public.protect_user_info_privileged_columns()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $function$
begin
  -- signed-in platform admin (unchanged)
  if public.is_admin() then
    return new;
  end if;

  -- trusted server contexts: the service-role key (admin console / backend
  -- services), or a superuser / the postgres role (migrations, dashboard).
  if coalesce(auth.role(), '') = 'service_role'
     or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin
     or new.status_id is distinct from old.status_id then
    raise exception 'Not authorized to modify this field';
  end if;

  return new;
end;
$function$;
