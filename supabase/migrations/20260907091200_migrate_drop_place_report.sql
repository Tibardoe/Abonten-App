-- Admin Console Phase 1 — retire the place-only place_report table.
--
-- The generic `report` table (20260907090200_generic_reports.sql) now
-- covers places and place reviews along with every other reportable
-- entity. The web reportPlace / reportPlaceReview actions and the mobile
-- report flow have been cut over to submitReportCore. This migrates any
-- existing rows (0 in prod at migration time) and drops the old table.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

insert into public.report
  (reporter_id, target_type, target_id, dedupe_key, category, details, status, priority, source, created_at)
select
  pr.reporter_id,
  case when pr.place_id is not null then 'place' else 'place_review' end as target_type,
  coalesce(pr.place_id, pr.review_id) as target_id,
  case when pr.place_id is not null then 'place:' else 'place_review:' end
    || coalesce(pr.place_id, pr.review_id)::text as dedupe_key,
  'other' as category,
  pr.reason as details,
  case pr.status when 'pending' then 'new' when 'resolved' then 'resolved'
                 when 'dismissed' then 'dismissed' else 'new' end as status,
  'normal' as priority,
  'web' as source,
  pr.created_at
from public.place_report pr
where coalesce(pr.place_id, pr.review_id) is not null
on conflict do nothing;

drop table if exists public.place_report cascade;
