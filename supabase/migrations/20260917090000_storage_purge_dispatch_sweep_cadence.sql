-- storage-purge-dispatch: poke the maintenance route for the daily
-- Cloudinary sweep at most once every 20 hours.
--
-- 20260916131000 dispatched whenever content_upload_sweep_at was null or
-- older than 20 hours. Only the new maintenance route records a sweep, so
-- until that code is deployed (and whenever the route cannot record one) the
-- job called the route every 10 minutes for nothing. The sweep is now due
-- only when both the last recorded sweep and the last dispatch are older
-- than 20 hours. Any dispatch runs the sweep if it is due, so a queue-driven
-- dispatch in between still counts.

create or replace function public.run_storage_purge_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg public.storage_purge_config;
  v_queue_work boolean;
  v_sweep_due boolean;
begin
  update public.storage_purge_queue q
  set status      = case when q.attempts >= 8 then 'failed' else 'queued' end,
      detail      = 'claim_expired',
      finished_at = case when q.attempts >= 8 then now() end
  where q.status = 'sending'
    and q.claimed_at < now() - interval '10 minutes';

  update public.draft_asset_cleanup_queue q
  set status      = case when q.attempts >= 8 then 'failed' else 'queued' end,
      detail      = 'claim_expired',
      finished_at = case when q.attempts >= 8 then now() end
  where q.status = 'sending'
    and q.claimed_at < now() - interval '10 minutes';

  select * into v_cfg from public.storage_purge_config where id = true;
  if v_cfg.dispatch_url is null then
    return;
  end if;

  v_queue_work := exists (select 1 from public.storage_purge_queue where status = 'queued')
               or exists (select 1 from public.draft_asset_cleanup_queue where status = 'queued');
  v_sweep_due := coalesce(v_cfg.content_upload_sweep_at < now() - interval '20 hours', true)
             and coalesce(v_cfg.last_dispatched_at < now() - interval '20 hours', true);
  if not (v_queue_work or v_sweep_due) then
    return;
  end if;

  perform net.http_post(
    url                  := v_cfg.dispatch_url,
    body                 := '{}'::jsonb,
    headers              := jsonb_build_object('Content-Type', 'application/json',
                                               'x-purge-token', v_cfg.token),
    timeout_milliseconds := 30000
  );

  update public.storage_purge_config
  set last_dispatched_at = now()
  where id = true;
end;
$$;

revoke all on function public.run_storage_purge_dispatch() from public, anon, authenticated;
