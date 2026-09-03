-- Admin Console Phase 1 — administrative audit log.
--
-- Append-only record of every sensitive administrative mutation (user
-- suspension, content moderation, report resolution, role change, future
-- financial actions...). Written only by recordAdminAudit() inside
-- @abonten/services/admin/**; never by client code.
--
-- Append-only is enforced at the database level: no UPDATE/DELETE
-- privilege for anyone, plus a trigger that raises on either — so even a
-- compromised service-role path cannot quietly rewrite history.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

create table public.admin_audit_log (
  id           uuid primary key default extensions.uuid_generate_v4(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_roles  text[] not null default array[]::text[],
  action       text not null,
  target_type  text,
  target_id    text,
  summary      text,
  reason       text,
  before       jsonb,
  after        jsonb,
  request_meta jsonb,
  created_at   timestamptz not null default now()
);

create index idx_admin_audit_log_created_at on public.admin_audit_log (created_at desc);
create index idx_admin_audit_log_actor      on public.admin_audit_log (actor_id, created_at desc);
create index idx_admin_audit_log_target     on public.admin_audit_log (target_type, target_id);
create index idx_admin_audit_log_action     on public.admin_audit_log (action, created_at desc);

revoke all on public.admin_audit_log from anon, authenticated;
grant select, insert on public.admin_audit_log to service_role;
-- deliberately NO update/delete grant, even to service_role.

alter table public.admin_audit_log enable row level security;
-- No policy: authenticated/anon get nothing; service_role bypasses RLS for
-- select/insert only (no update/delete privilege exists to bypass).

create function public.admin_audit_log_is_append_only()
  returns trigger
  language plpgsql
  set search_path = ''
as $function$
begin
  raise exception 'admin_audit_log is append-only';
end;
$function$;

create trigger trg_admin_audit_log_no_update
  before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_log_is_append_only();
