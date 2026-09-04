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
-- REDACTED 2026-09-04: this migration originally embedded the live anon
-- key as a literal here. It's Supabase's public/publishable key -- already
-- shipped in this project's client bundles as
-- NEXT_PUBLIC_SUPABASE_ANON_KEY -- so nothing was ever compromised, but a
-- secret scanner (GitGuardian) correctly flags any Supabase-JWT-shaped
-- literal regardless of which role it carries, and the project preference
-- is that no credential-shaped literal sits in a migration file at all.
-- The placeholder below was never a real value in the live database: by
-- the time this file was edited, migration 20260907098000 had already
-- extracted the real (still-unrotated) anon key out of the live cron job
-- and moved it into a Vault secret (`cleanup_expired_events_anon_key`),
-- which is what the job actually reads today. Replaying this migration
-- from scratch (a fresh install) will fail loudly and safely at
-- 20260907098000's length check ("Could not extract the anon key...")
-- rather than silently installing a broken credential -- see that file
-- for the real mechanism a fresh install needs to complete manually
-- (populate the anon key into Vault, once, via the Dashboard).
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
              'Bearer REDACTED'
            ),
            timeout_milliseconds:=1000
        );
    $cron_cmd$
  );

  raise notice 'cleanupExpiredEvents (jobid %) now sends the anon key for gateway verify_jwt only; the edge function''s own SERVICE_ROLE_KEY secret (set via Dashboard, not this migration) is what talks to the database', v_job_id;
end $$;
