-- Admin Console Phase 1 — covering indexes for the new tables' foreign
-- keys, matching the standard set by 20260903201259_fk_covering_indexes.sql
-- (clears the unindexed_foreign_keys performance advisory).
--
-- These FK columns are all low-write audit references (who created / granted
-- / resolved / authored). The indexes are tiny and keep DELETE / cascade
-- checks on auth.users cheap.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

create index if not exists idx_admin_note_author       on public.admin_note (author_id);
create index if not exists idx_admin_note_supersedes   on public.admin_note (supersedes_id);
create index if not exists idx_admin_user_created_by   on public.admin_user (created_by);
create index if not exists idx_admin_user_disabled_by  on public.admin_user (disabled_by);
create index if not exists idx_admin_user_role_granted_by on public.admin_user_role (granted_by);
create index if not exists idx_app_error_event_user    on public.app_error_event (user_id);
create index if not exists idx_app_error_group_assigned on public.app_error_group (assigned_to);
create index if not exists idx_incident_created_by     on public.incident (created_by);
create index if not exists idx_moderation_action_actor on public.moderation_action (actor_id);
create index if not exists idx_report_resolved_by      on public.report (resolved_by);
create index if not exists idx_report_event_actor      on public.report_event (actor_id);
