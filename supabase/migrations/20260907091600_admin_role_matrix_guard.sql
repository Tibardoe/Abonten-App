-- Runtime-editable role -> permission matrix.
--
-- Phase 1 seeded admin_role_permission once and treated the code constant
-- ROLE_PERMISSIONS (@abonten/core/adminPermissions) as the live authority
-- (resolveAdminContext mapped roles -> perms in memory). This makes the
-- admin_role_permission TABLE the source of truth: resolveAdminContext now
-- reads it, and Admin > Settings can toggle cells (super_admin only,
-- step-up, audited).
--
-- Guard: super_admin's grant set is immutable at the DB level so the
-- matrix editor can never lock every admin out of settings / admin
-- management. resolveAdminContext also hard-guarantees super_admin = all
-- known permissions regardless of table state, and falls back to the code
-- constant if the table read fails or a role has zero rows.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq,
-- version 20260904031948) then saved here as the source-of-truth copy.

create or replace function public.guard_super_admin_role_permissions()
  returns trigger
  language plpgsql
  set search_path = ''
as $function$
begin
  if coalesce(new.role_key, old.role_key) = 'super_admin' then
    raise exception 'super_admin role permissions are immutable'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$function$;

create trigger trg_guard_super_admin_role_permissions
  before insert or update or delete on public.admin_role_permission
  for each row execute function public.guard_super_admin_role_permissions();
