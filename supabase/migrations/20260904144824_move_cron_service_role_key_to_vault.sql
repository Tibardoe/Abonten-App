-- SEC-004 (docs/audit/01-limitations-register.md): the `cleanupExpiredEvents`
-- pg_cron job (jobid 3, live only in cron.job — never a repo migration)
-- calls the delete-expired-events edge function with a service-role JWT
-- embedded in plain text inside its command string. Anyone who can read
-- cron.job (or a database dump/backup) can read that key.
--
-- This migration does NOT rotate or revoke anything: it moves the exact
-- same, already-live key into Supabase Vault (encrypted at rest,
-- readable only via the vault.decrypted_secrets view, itself only
-- selectable by roles with the right grants), and repoints the cron job
-- to read it from there instead of carrying it inline. The key value is
-- extracted directly out of the live cron.job row inside this DO block,
-- so the plaintext key is never typed into this file / committed to git
-- history. Everything else about the job (schedule, target URL, timeout)
-- is byte-for-byte unchanged.
--
-- Safe to re-run: the vault secret is only created if it doesn't already
-- exist under this name, and cron.alter_job just re-applies the same
-- command.
--
-- Rotation (generating a NEW key and revoking the old one) is a separate,
-- deliberate follow-up — NOT part of this migration. See the register for
-- the plan.

do $$
declare
  v_current_command text;
  v_current_key text;
  v_job_id bigint;
begin
  select jobid, command into v_job_id, v_current_command
  from cron.job
  where jobname = 'cleanupExpiredEvents';

  if v_job_id is null then
    raise exception 'cleanupExpiredEvents cron job not found -- aborting, nothing changed';
  end if;

  v_current_key := substring(v_current_command from 'Bearer ([^'']+)');

  if v_current_key is null or length(v_current_key) < 20 then
    raise exception 'Could not extract the existing service-role key from cron.job.command -- aborting, nothing changed';
  end if;

  if not exists (
    select 1 from vault.secrets
    where name = 'cleanup_expired_events_service_role_key'
  ) then
    perform vault.create_secret(
      v_current_key,
      'cleanup_expired_events_service_role_key',
      'Service-role JWT for the cleanupExpiredEvents cron job. Moved out of '
      || 'cron.job.command 2026-09-04 (SEC-004) -- same key value as '
      || 'before, not yet rotated.'
    );
  end if;

  perform cron.alter_job(
    v_job_id,
    command := $cron_cmd$
      select
        net.http_get(
            url:='https://sderrexhawjbmsugndcq.supabase.co/functions/v1/delete-expired-events',
            headers:=jsonb_build_object(
              'Authorization',
              'Bearer ' || (
                select decrypted_secret from vault.decrypted_secrets
                where name = 'cleanup_expired_events_service_role_key'
              )
            ),
            timeout_milliseconds:=1000
        );
    $cron_cmd$
  );

  raise notice 'cleanupExpiredEvents (jobid %) now reads its service-role key from Vault', v_job_id;
end $$;
