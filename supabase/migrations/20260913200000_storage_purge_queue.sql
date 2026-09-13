-- Storage purge queue: delete bucket objects through the Storage API.
--
-- Both nightly retention jobs (purge_reviewed_claim_documents,
-- purge_verification_evidence) deleted rows straight out of
-- storage.objects. That never removed the underlying files -- only the
-- Storage API does -- and since Supabase added storage.protect_delete()
-- the statement is refused outright, so both jobs have failed on every
-- run (cron.job_run_details: "Direct deletion from storage tables is not
-- allowed. Use the Storage API instead.") and the 30-day / retention
-- promises for claim documents and verification evidence were not kept.
--
-- From now on the SQL side only decides WHAT is due: it enqueues
-- (bucket, path) rows here and updates its own tables. The
-- `storage-purge-dispatch` pg_cron job pokes POST /api/maintenance/storage-purge
-- on the web app (same pattern as notification-delivery: a token kept in a
-- config row, no environment variable), and that route deletes the objects
-- with the service-role Storage API client, recording the outcome per row.
-- Anything the API cannot delete is retried up to 8 times and then marked
-- failed for a person to look at.

create table public.storage_purge_queue (
  id           bigint generated always as identity primary key,
  bucket_id    text not null,
  object_path  text not null,
  reason       text not null,
  status       text not null default 'queued'
               check (status in ('queued', 'sending', 'done', 'failed')),
  attempts     integer not null default 0,
  detail       text,
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz,
  finished_at  timestamptz
);

comment on table public.storage_purge_queue is
  'Bucket objects due for deletion through the Storage API. Written by the retention SQL functions, drained by POST /api/maintenance/storage-purge.';

-- One open row per object: a second enqueue of the same path while the
-- first is still pending is a no-op.
create unique index storage_purge_queue_open_uidx
  on public.storage_purge_queue (bucket_id, object_path)
  where status in ('queued', 'sending');

create index storage_purge_queue_status_idx
  on public.storage_purge_queue (id)
  where status in ('queued', 'sending');

create table public.storage_purge_config (
  id                 boolean primary key default true check (id),
  dispatch_url       text,
  token              text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  last_dispatched_at timestamptz,
  updated_at         timestamptz not null default now()
);

comment on table public.storage_purge_config is
  'Where the storage-purge-dispatch cron posts and the token it sends (x-purge-token). Service role reads the token to check the header.';

-- The dispatch URL lives next to the notification one; derive it from that
-- row when it is set (production has it), otherwise leave NULL (nothing is
-- dispatched until someone sets it -- the queue simply accumulates).
insert into public.storage_purge_config (id, dispatch_url)
select true,
       case
         when c.dispatch_url ~ '/api/notifications/deliver$'
           then regexp_replace(c.dispatch_url, '/api/notifications/deliver$', '/api/maintenance/storage-purge')
         else null
       end
from public.notification_delivery_config c
where c.id = true
on conflict (id) do nothing;

insert into public.storage_purge_config (id) values (true)
on conflict (id) do nothing;

alter table public.storage_purge_queue  enable row level security;
alter table public.storage_purge_config enable row level security;
revoke all on table public.storage_purge_queue, public.storage_purge_config
  from anon, authenticated, service_role;
grant select on table public.storage_purge_queue, public.storage_purge_config
  to service_role;

-- ---------------------------------------------------------------------------
-- Queue functions
-- ---------------------------------------------------------------------------

create or replace function public.storage_purge_enqueue(
  p_bucket text,
  p_path   text,
  p_reason text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.storage_purge_queue (bucket_id, object_path, reason)
  values (p_bucket, p_path, p_reason)
  on conflict (bucket_id, object_path) where status in ('queued', 'sending') do nothing;
$$;

-- Hand a batch to the route: rows go to 'sending' so an overlapping call
-- never deletes (or counts) the same object twice.
create or replace function public.storage_purge_claim(p_limit integer default 200)
returns table (purge_id bigint, bucket_id text, object_path text)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select q.id
    from public.storage_purge_queue q
    where q.status = 'queued'
    order by q.id
    limit least(greatest(p_limit, 1), 500)
    for update skip locked
  ), claimed as (
    update public.storage_purge_queue q
    set status = 'sending', attempts = q.attempts + 1, claimed_at = now()
    from due
    where q.id = due.id
    returning q.id, q.bucket_id, q.object_path
  )
  select c.id, c.bucket_id, c.object_path from claimed c order by c.id;
$$;

create or replace function public.storage_purge_finish(
  p_ids    bigint[],
  p_status text,
  p_detail text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_status not in ('done', 'failed', 'queued') then
    raise exception 'storage_purge_finish: unknown status %', p_status;
  end if;

  update public.storage_purge_queue q
  set status      = case when p_status = 'queued' and q.attempts >= 8 then 'failed' else p_status end,
      detail      = left(p_detail, 500),
      finished_at = case when p_status = 'queued' and q.attempts < 8 then null else now() end
  where q.id = any (p_ids)
    and q.status = 'sending';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Called by pg_cron. Requeues a claim that never finished, then pokes the
-- route only while something is waiting.
create or replace function public.run_storage_purge_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg public.storage_purge_config;
begin
  update public.storage_purge_queue q
  set status      = case when q.attempts >= 8 then 'failed' else 'queued' end,
      detail      = 'claim_expired',
      finished_at = case when q.attempts >= 8 then now() end
  where q.status = 'sending'
    and q.claimed_at < now() - interval '10 minutes';

  select * into v_cfg from public.storage_purge_config where id = true;
  if v_cfg.dispatch_url is null
     or not exists (select 1 from public.storage_purge_queue where status = 'queued') then
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

revoke all on function public.storage_purge_enqueue(text, text, text) from public, anon, authenticated;
revoke all on function public.storage_purge_claim(integer) from public, anon, authenticated;
revoke all on function public.storage_purge_finish(bigint[], text, text) from public, anon, authenticated;
revoke all on function public.run_storage_purge_dispatch() from public, anon, authenticated;
grant execute on function public.storage_purge_claim(integer) to service_role;
grant execute on function public.storage_purge_finish(bigint[], text, text) to service_role;
grant execute on function public.storage_purge_enqueue(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- The two retention jobs now enqueue instead of touching storage.objects.
-- ---------------------------------------------------------------------------

create or replace function public.purge_reviewed_claim_documents(
  p_older_than interval default '30 days'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  insert into public.storage_purge_queue (bucket_id, object_path, reason)
  select 'place-claim-documents', d.storage_path, 'claim_document_retention'
  from public.place_claim_document d
  join public.place_claim_request r on r.id = d.claim_request_id
  where r.status in ('approved', 'rejected')
    and r.reviewed_at is not null
    and r.reviewed_at < now() - p_older_than
  on conflict (bucket_id, object_path) where status in ('queued', 'sending') do nothing;

  delete from public.place_claim_document d
  using public.place_claim_request r
  where r.id = d.claim_request_id
    and r.status in ('approved', 'rejected')
    and r.reviewed_at is not null
    and r.reviewed_at < now() - p_older_than;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.purge_verification_evidence()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s            public.verification_program_setting%rowtype;
  r            record;
  v_withdrawn  integer := 0;
  v_purged     integer := 0;
  v_orphans    integer := 0;
  v_due_ids    uuid[];
begin
  select * into s from public.verification_program_setting where id = 1;

  for r in
    select id from public.verification_case
    where status = 'draft'
      and updated_at < now() - make_interval(days => s.draft_expiry_days)
  loop
    perform public.verification_transition(r.id, null, 'system', 'withdraw', 'draft_expired', null);
    v_withdrawn := v_withdrawn + 1;
  end loop;

  select coalesce(array_agg(e.id), '{}') into v_due_ids
  from public.verification_evidence e
  join public.verification_case c on c.id = e.case_id
  where e.status in ('pending_upload', 'uploaded')
    and (
         (c.status in ('rejected', 'withdrawn')
            and c.updated_at < now() - make_interval(days => s.retention_days_unapproved))
      or (c.status = 'revoked'
            and c.revoked_at < now() - make_interval(days => s.retention_days_after_revoke))
    );

  if cardinality(v_due_ids) > 0 then
    insert into public.storage_purge_queue (bucket_id, object_path, reason)
    select 'verification-evidence', e.storage_path, 'verification_evidence_retention'
    from public.verification_evidence e
    where e.id = any (v_due_ids)
      and e.storage_path is not null
    on conflict (bucket_id, object_path) where status in ('queued', 'sending') do nothing;

    update public.verification_evidence
       set status = 'purged', purged_at = now()
     where id = any (v_due_ids);
    get diagnostics v_purged = row_count;

    insert into public.verification_event (case_id, actor_kind, event_type, meta)
    select e.case_id, 'system', 'evidence_purged', jsonb_build_object('count', count(*))
    from public.verification_evidence e
    where e.id = any (v_due_ids)
    group by e.case_id;
  end if;

  -- Objects nobody references any more (an upload whose row was removed).
  insert into public.storage_purge_queue (bucket_id, object_path, reason)
  select 'verification-evidence', o.name, 'verification_evidence_orphan'
  from storage.objects o
  where o.bucket_id = 'verification-evidence'
    and o.created_at < now() - interval '1 day'
    and not exists (select 1 from public.verification_evidence e where e.storage_path = o.name)
  on conflict (bucket_id, object_path) where status in ('queued', 'sending') do nothing;
  get diagnostics v_orphans = row_count;

  delete from public.verification_evidence
  where status = 'pending_upload' and created_at < now() - interval '2 days';

  return jsonb_build_object('withdrawn', v_withdrawn, 'purged', v_purged, 'orphans', v_orphans);
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedule
-- ---------------------------------------------------------------------------

select cron.unschedule(j.jobname)
from cron.job j
where j.jobname = 'storage-purge-dispatch';

select cron.schedule('storage-purge-dispatch', '*/10 * * * *',
  $$select public.run_storage_purge_dispatch();$$);
