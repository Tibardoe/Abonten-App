-- SEC-004 step 2 (docs/audit/01-limitations-register.md): finish separating
-- "proof this call is allowed to reach the function at all" from "the
-- credential that actually touches the database."
--
-- The `delete-expired-events` Edge Function has `verify_jwt = true`, which
-- Supabase's own migration guide confirms only ever accepts a real JWT in
-- `Authorization` -- the new sb_publishable_/sb_secret_ keys are not JWTs
-- and are rejected before the function even runs. Separately, verify_jwt
-- does not inspect the JWT's role claim -- it only checks that the token is
-- a validly-signed Supabase JWT. So the anon key satisfies this gateway
-- check exactly as well as the service-role JWT did, while carrying zero
-- elevated privilege: nothing sensitive travels in this call anymore.
--
-- The function's own internal database access is unaffected by this
-- migration -- it already runs on a brand-new sb_secret_... key set
-- directly as the function's SERVICE_ROLE_KEY secret via the Supabase
-- Dashboard (2026-09-04), never through this repo or this file.
--
-- The literal below is Supabase's public/publishable anon key -- already
-- shipped in this project's client bundles as
-- NEXT_PUBLIC_SUPABASE_ANON_KEY. It is not a secret by Supabase's own
-- classification (anon keys are designed to be embedded in public,
-- client-side code), so storing it as a plain literal here introduces no
-- new exposure, unlike the service-role credential it replaces.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'cleanupExpiredEvents';

  if v_job_id is null then
    raise exception 'cleanupExpiredEvents cron job not found -- aborting, nothing changed';
  end if;

  perform cron.alter_job(
    v_job_id,
    command := $cron_cmd$
      select
        net.http_get(
            url:='https://sderrexhawjbmsugndcq.supabase.co/functions/v1/delete-expired-events',
            headers:=jsonb_build_object(
              'Authorization',
              'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkZXJyZXhoYXdqYm1zdWduZGNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA1Njg5MjUsImV4cCI6MjA1NjE0NDkyNX0.y90702uAZONNJk46uhln-SutG1pUeioC-hTP1Su3nuM'
            ),
            timeout_milliseconds:=1000
        );
    $cron_cmd$
  );

  raise notice 'cleanupExpiredEvents (jobid %) now sends the anon key for gateway verify_jwt only; the edge function''s own SERVICE_ROLE_KEY secret (set via Dashboard, not this migration) is what talks to the database', v_job_id;
end $$;
