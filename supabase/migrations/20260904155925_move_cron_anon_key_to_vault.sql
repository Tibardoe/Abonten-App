-- Follow-up to 20260907097000: that migration put the anon key directly
-- into cleanupExpiredEvents's cron.job.command as a literal. The anon key
-- is genuinely public by Supabase's own design (it's meant to be embedded
-- in client-side bundles, and already is -- NEXT_PUBLIC_SUPABASE_ANON_KEY),
-- so this was never a credential exposure. But GitGuardian correctly
-- pattern-matches any embedded Supabase JWT regardless of which role it
-- carries, and the project preference is simply: no credential-shaped
-- literal sits in a migration file, full stop -- consistent with how the
-- service-role key was already handled in 20260907096000.
--
-- This migration removes that literal without rotating the anon key
-- itself (it is not compromised -- there is nothing to rotate) and without
-- changing verify_jwt behaviour at all: the Edge Function still receives
-- the exact same anon-key JWT in its Authorization header, satisfying the
-- platform's verify_jwt check exactly as before -- only its storage
-- location changes, from a literal in this repo's history to an encrypted
-- Vault secret. The key value is extracted live from the currently
-- configured cron job, so it is never typed into this file.
do $$
declare
  v_current_command text;
  v_anon_key text;
  v_job_id bigint;
begin
  select jobid, command into v_job_id, v_current_command
  from cron.job
  where jobname = 'cleanupExpiredEvents';

  if v_job_id is null then
    raise exception 'cleanupExpiredEvents cron job not found -- aborting, nothing changed';
  end if;

  v_anon_key := substring(v_current_command from 'Bearer ([^'']+)');

  if v_anon_key is null or length(v_anon_key) < 20 then
    raise exception 'Could not extract the anon key from cron.job.command -- aborting, nothing changed';
  end if;

  if not exists (
    select 1 from vault.secrets where name = 'cleanup_expired_events_anon_key'
  ) then
    perform vault.create_secret(
      v_anon_key,
      'cleanup_expired_events_anon_key',
      'Anon key used only to satisfy delete-expired-events'' verify_jwt '
      || 'gateway check for the cleanupExpiredEvents cron -- carries no '
      || 'elevated privilege. Moved out of cron.job.command 2026-09-04 '
      || '(GitGuardian flagged the literal in commit 9919ac9) -- same '
      || 'key, not rotated, nothing was compromised.'
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
                where name = 'cleanup_expired_events_anon_key'
              )
            ),
            timeout_milliseconds:=1000
        );
    $cron_cmd$
  );

  raise notice 'cleanupExpiredEvents (jobid %) now reads its anon-key Authorization header from Vault -- no literal credential in cron.job.command', v_job_id;
end $$;
