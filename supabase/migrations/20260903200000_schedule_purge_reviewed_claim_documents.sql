-- Retention for §12 place-claim documents: purge the stored bytes + rows
-- for claims approved/rejected more than 30 days ago, once a day at 03:00.
-- Same cron.schedule pattern as expire-stale-*-checkouts / cleanup-expired-
-- drafts (see `select * from cron.job`). Idempotent: unschedule first so
-- re-running the migration doesn't stack duplicate jobs.
--
-- Applied live via the Supabase MCP on 2026-09-03 (project sderrexhawjbmsugndcq).

select cron.unschedule('purge-reviewed-claim-documents')
where exists (
  select 1 from cron.job where jobname = 'purge-reviewed-claim-documents'
);

select cron.schedule(
  'purge-reviewed-claim-documents',
  '0 3 * * *',
  $$SELECT public.purge_reviewed_claim_documents();$$
);
