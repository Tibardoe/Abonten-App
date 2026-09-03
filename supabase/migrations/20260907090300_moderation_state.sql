-- Admin Console Phase 1 — content moderation state.
--
-- Adds a uniform, ADDITIVE moderation dimension to every piece of
-- user-generated content that can be reported. It is independent of the
-- existing lifecycle columns (event.status draft/published/canceled/
-- completed, place.status, review.status pending/approved/rejected) — those
-- are untouched.
--
--   moderation_state:
--     null / 'visible'  -> normal, shown everywhere
--     'restricted'      -> still visible publicly, but flagged (e.g. not
--                          eligible for featuring/promotion)
--     'hidden'          -> withheld from public read paths, recoverable
--     'removed'         -> withheld from public read paths (staff removal)
--
-- Public read paths get a `moderation_state is distinct from 'hidden' and
-- moderation_state is distinct from 'removed'` filter (application code +
-- the get_filtered_events / get_nearby_events RPCs, done in
-- 20260907090500_moderation_filter_public_reads.sql).
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

do $$
declare
  t text;
begin
  foreach t in array array[
    'public.event','public.place','public.highlight',
    'public.review','public.event_review','public.place_review'
  ]
  loop
    execute format($f$
      alter table %s
        add column if not exists moderation_state   text
          check (moderation_state is null or moderation_state in
                 ('visible','restricted','hidden','removed')),
        add column if not exists moderated_at        timestamptz,
        add column if not exists moderated_by        uuid references auth.users(id) on delete set null,
        add column if not exists moderation_reason   text
    $f$, t);
  end loop;
end $$;

-- Small partial indexes on the high-traffic public entities so the planner
-- can cheaply exclude the (always tiny) moderated set at scale.
create index if not exists idx_event_moderation_state
  on public.event (moderation_state) where moderation_state is not null;
create index if not exists idx_place_moderation_state
  on public.place (moderation_state) where moderation_state is not null;

-- ============================================================
-- moderation_action — canonical record of every content-state change
-- ============================================================

create table public.moderation_action (
  id              uuid primary key default extensions.uuid_generate_v4(),
  actor_id        uuid references auth.users(id) on delete set null,
  target_type     text not null check (target_type in (
                    'event','place','event_review','place_review',
                    'user_review','highlight','user')),
  target_id       uuid not null,
  action          text not null check (action in (
                    'hide','unhide','remove','restore','restrict','unrestrict')),
  reason          text,
  report_id       uuid references public.report(id) on delete set null,
  idempotency_key text not null unique,
  created_at      timestamptz not null default now()
);

create index idx_moderation_action_target on public.moderation_action (target_type, target_id, created_at desc);
create index idx_moderation_action_report on public.moderation_action (report_id) where report_id is not null;

revoke all on public.moderation_action from anon, authenticated;
grant all on public.moderation_action to service_role;
alter table public.moderation_action enable row level security;
-- staff-only via service role.
