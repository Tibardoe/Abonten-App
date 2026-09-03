-- Admin Console Phase 1 — generic polymorphic reporting.
--
-- Replaces the place-only `place_report` table (0 rows in prod; migrated
-- and dropped in 20260907090400_migrate_drop_place_report.sql once the
-- reportPlace / reportPlaceReview actions are cut over). A `report` row
-- can target any reportable entity: event, place, event/place/user review,
-- user, organizer, highlight.
--
-- Security model for the user-facing side (spec §5):
--   * reporter_id is ALWAYS set server-side from the session — the client
--     value is ignored (submitReportCore).
--   * a reporter may INSERT their own rows and SELECT their own rows;
--     never UPDATE/DELETE. All triage/mutation happens through
--     @abonten/services/admin/** on the service-role client.
--   * a partial unique index blocks a second OPEN report on the same
--     target by the same reporter (dedup + anti-spam) without blocking
--     distinct legitimate reports.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

-- ============================================================
-- report
-- ============================================================

create table public.report (
  id                uuid primary key default extensions.uuid_generate_v4(),
  reporter_id       uuid references auth.users(id) on delete set null,
  target_type       text not null check (target_type in (
                      'event','place','event_review','place_review',
                      'user_review','user','organizer','highlight')),
  target_id         uuid not null,
  dedupe_key        text not null,               -- '<target_type>:<target_id>'
  category          text not null check (category in (
                      'spam','fraud_scam','misleading','harassment',
                      'inappropriate','fake_listing','safety','copyright',
                      'impersonation','other')),
  details           text check (details is null or char_length(details) <= 2000),
  status            text not null default 'new' check (status in (
                      'new','under_review','awaiting_info','escalated',
                      'resolved','dismissed','false_report')),
  priority          text not null default 'normal' check (priority in (
                      'low','normal','high','urgent')),
  source            text not null default 'web' check (source in ('web','mobile')),
  assigned_to       uuid references public.admin_user(user_id) on delete set null,
  resolution        text,
  resolution_action text,
  resolved_by       uuid references auth.users(id) on delete set null,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_report_triage       on public.report (status, priority, created_at desc);
create index idx_report_dedupe        on public.report (dedupe_key);
create index idx_report_assigned      on public.report (assigned_to) where assigned_to is not null;
create index idx_report_reporter      on public.report (reporter_id, created_at desc);
create index idx_report_target        on public.report (target_type, target_id);
create index idx_report_created_at    on public.report (created_at desc);

-- One open report per reporter per target.
create unique index idx_report_one_open_per_reporter_target
  on public.report (reporter_id, dedupe_key)
  where status in ('new','under_review','awaiting_info');

create function public.touch_report_updated_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create trigger trg_report_touch_updated_at
  before update on public.report
  for each row execute function public.touch_report_updated_at();

revoke all on public.report from anon, authenticated;
grant select, insert on public.report to authenticated;
grant all on public.report to service_role;

alter table public.report enable row level security;

create policy report_reporter_insert on public.report
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create policy report_reporter_select on public.report
  for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_staff());

-- ============================================================
-- report_attachment  +  private storage bucket
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-attachments',
  'report-attachments',
  false,
  10485760, -- 10 MB
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
on conflict (id) do nothing;

-- Object key layout: <reporter_id>/<report_id>/<uuid>.<ext>
create policy "report_attachments_reporter_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "report_attachments_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'report-attachments'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_staff()
    )
  );

create table public.report_attachment (
  id           uuid primary key default extensions.uuid_generate_v4(),
  report_id    uuid not null references public.report(id) on delete cascade,
  storage_path text not null,
  file_name    text,
  mime_type    text,
  size_bytes   integer,
  created_at   timestamptz not null default now()
);

create index idx_report_attachment_report on public.report_attachment (report_id);

revoke all on public.report_attachment from anon, authenticated;
grant select, insert on public.report_attachment to authenticated;
grant all on public.report_attachment to service_role;

alter table public.report_attachment enable row level security;

create policy report_attachment_reporter_insert on public.report_attachment
  for insert to authenticated
  with check (
    exists (
      select 1 from public.report r
      where r.id = report_id and r.reporter_id = (select auth.uid())
    )
  );

create policy report_attachment_select on public.report_attachment
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.report r
      where r.id = report_id and r.reporter_id = (select auth.uid())
    )
  );

-- ============================================================
-- report_event — investigation timeline (staff-only)
-- ============================================================

create table public.report_event (
  id         uuid primary key default extensions.uuid_generate_v4(),
  report_id  uuid not null references public.report(id) on delete cascade,
  actor_id   uuid references auth.users(id) on delete set null,  -- null = system
  kind       text not null check (kind in (
               'created','assigned','status_changed','note_added',
               'info_requested','escalated','action_taken','resolved','reopened')),
  data       jsonb,
  created_at timestamptz not null default now()
);

create index idx_report_event_report on public.report_event (report_id, created_at);

revoke all on public.report_event from anon, authenticated;
grant all on public.report_event to service_role;
alter table public.report_event enable row level security;
-- staff-only, via service role.

-- ============================================================
-- admin_note — internal notes on any entity (staff-only)
-- ============================================================

create table public.admin_note (
  id            uuid primary key default extensions.uuid_generate_v4(),
  author_id     uuid references auth.users(id) on delete set null,
  target_type   text not null,
  target_id     text not null,
  body          text not null check (char_length(body) between 1 and 4000),
  supersedes_id uuid references public.admin_note(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index idx_admin_note_target on public.admin_note (target_type, target_id, created_at desc);

revoke all on public.admin_note from anon, authenticated;
grant select, insert on public.admin_note to service_role;
-- no update/delete: an edit is a new row pointing at supersedes_id.
alter table public.admin_note enable row level security;

create function public.admin_note_is_immutable()
  returns trigger
  language plpgsql
  set search_path = ''
as $function$
begin
  raise exception 'admin_note rows are immutable; create a new row with supersedes_id';
end;
$function$;

create trigger trg_admin_note_immutable
  before update or delete on public.admin_note
  for each row execute function public.admin_note_is_immutable();
