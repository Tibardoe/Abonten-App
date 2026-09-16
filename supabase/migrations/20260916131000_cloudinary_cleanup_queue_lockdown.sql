-- Cloudinary asset cleanup: lock the queue down and drain it reliably.
--
-- Two problems found in the Spotlight & Stories pre-merge audit:
--
-- 1. draft_asset_cleanup_queue had an "authenticated may do anything"
--    policy plus INSERT/DELETE grants. Anything in the queue is destroyed on
--    Cloudinary by the drain, so any signed-in person could insert another
--    user's public_id (an avatar, an event flyer, a Spotlight video) and have
--    it deleted, or delete queued rows to keep content they were meant to
--    lose. Clients never needed it: every legitimate writer is server code
--    or a SECURITY DEFINER job. Client access is removed.
--
-- 2. The queue was drained only when somebody opened the web Drafts page.
--    content_housekeeping() (expired Stories and deleted posts past
--    retention, never-attached uploads) queues media there, so deleted
--    Spotlight and Story media stayed on Cloudinary indefinitely. The
--    existing storage-purge dispatch job now also pokes the maintenance
--    route when this queue has work, and the route drains it with the same
--    claim / finish / retry pattern as storage_purge_queue.

-- ---------------------------------------------------------------------
-- 1. Access
-- ---------------------------------------------------------------------
drop policy if exists "draft_asset_cleanup_queue_authenticated_all" on public.draft_asset_cleanup_queue;
revoke all on table public.draft_asset_cleanup_queue from anon, authenticated;
revoke all on sequence public.draft_asset_cleanup_queue_id_seq from anon, authenticated;
alter table public.draft_asset_cleanup_queue enable row level security;
grant all on table public.draft_asset_cleanup_queue to service_role;

-- ---------------------------------------------------------------------
-- 2. Claim / finish bookkeeping
-- ---------------------------------------------------------------------
alter table public.draft_asset_cleanup_queue
  add column if not exists status      text        not null default 'queued'
                                         check (status in ('queued', 'sending', 'done', 'failed')),
  add column if not exists attempts    integer     not null default 0,
  add column if not exists claimed_at  timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists detail      text;

alter table public.draft_asset_cleanup_queue
  drop constraint if exists draft_asset_cleanup_queue_resource_type_check;
alter table public.draft_asset_cleanup_queue
  add constraint draft_asset_cleanup_queue_resource_type_check
  check (resource_type in ('image', 'video'));

create index if not exists draft_asset_cleanup_queue_open_idx
  on public.draft_asset_cleanup_queue (id)
  where status in ('queued', 'sending');

comment on table public.draft_asset_cleanup_queue is
  'Cloudinary assets due for destruction (expired draft flyers, orphaned highlight uploads, Spotlight/Story media past retention, rejected or never-attached content uploads). Server-only. Drained by POST /api/maintenance/storage-purge via cloudinary_cleanup_claim / cloudinary_cleanup_finish.';

create or replace function public.cloudinary_cleanup_claim(p_limit integer default 50)
returns table (cleanup_id bigint, public_id text, resource_type text)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select q.id
    from public.draft_asset_cleanup_queue q
    where q.status = 'queued'
    order by q.id
    limit least(greatest(p_limit, 1), 200)
    for update skip locked
  ), claimed as (
    update public.draft_asset_cleanup_queue q
    set status = 'sending', attempts = q.attempts + 1, claimed_at = now()
    from due
    where q.id = due.id
    returning q.id, q.public_id, q.resource_type
  )
  select c.id, c.public_id, c.resource_type from claimed c order by c.id;
$$;

create or replace function public.cloudinary_cleanup_finish(
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
    raise exception 'cloudinary_cleanup_finish: unknown status %', p_status;
  end if;
  update public.draft_asset_cleanup_queue q
  set status      = case when p_status = 'queued' and q.attempts >= 8 then 'failed' else p_status end,
      detail      = left(p_detail, 500),
      finished_at = case when p_status = 'queued' and q.attempts < 8 then null else now() end
  where q.id = any (p_ids)
    and q.status = 'sending';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.cloudinary_cleanup_claim(integer) from public, anon, authenticated;
revoke all on function public.cloudinary_cleanup_finish(bigint[], text, text) from public, anon, authenticated;
grant execute on function public.cloudinary_cleanup_claim(integer) to service_role;
grant execute on function public.cloudinary_cleanup_finish(bigint[], text, text) to service_role;

alter table public.storage_purge_config
  add column if not exists content_upload_sweep_at timestamptz;

-- ---------------------------------------------------------------------
-- 3. The dispatch job also fires for Cloudinary work
-- ---------------------------------------------------------------------
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

  update public.draft_asset_cleanup_queue q
  set status      = case when q.attempts >= 8 then 'failed' else 'queued' end,
      detail      = 'claim_expired',
      finished_at = case when q.attempts >= 8 then now() end
  where q.status = 'sending'
    and q.claimed_at < now() - interval '10 minutes';

  select * into v_cfg from public.storage_purge_config where id = true;
  -- Also once a day for the unregistered-upload sweep (see section 5).
  if v_cfg.dispatch_url is null
     or (not exists (select 1 from public.storage_purge_queue where status = 'queued')
         and not exists (select 1 from public.draft_asset_cleanup_queue where status = 'queued')
         and v_cfg.content_upload_sweep_at is not null
         and v_cfg.content_upload_sweep_at >= now() - interval '20 hours') then
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

-- ---------------------------------------------------------------------
-- 4. Content housekeeping: a media row is "purged" only once Cloudinary
--    confirmed the destroy (its queue row is done), not merely queued.
-- ---------------------------------------------------------------------
create or replace function public.content_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.content_program_setting%rowtype;
  v_stories integer := 0;
  v_deleted integer := 0;
  v_orphans integer := 0;
  v_views integer := 0;
  v_clicks integer := 0;
  v_seen integer := 0;
begin
  select * into s from public.content_program_setting where id = 1;

  with due as (
    update public.content_post p
    set status = 'archived', deleted_at = coalesce(p.deleted_at, now())
    where p.kind = 'story' and p.status = 'published'
      and p.expires_at < now() - make_interval(days => s.expired_story_retention_days)
    returning p.id
  )
  select count(*) into v_stories from due;

  with due as (
    update public.content_media m
    set status = 'deleted', deleted_at = coalesce(m.deleted_at, now())
    from public.content_post p
    where m.post_id = p.id and m.status <> 'deleted'
      and p.status in ('archived', 'deleted')
      and coalesce(p.deleted_at, p.updated_at) < now() - make_interval(days => s.deleted_post_retention_days)
    returning m.public_id, m.media_type
  ), queued as (
    insert into public.draft_asset_cleanup_queue (public_id, resource_type)
    select public_id, media_type from due
    returning 1
  )
  select count(*) into v_deleted from queued;

  with due as (
    update public.content_media m
    set status = 'deleted', deleted_at = now()
    where m.post_id is null and m.status <> 'deleted'
      and m.created_at < now() - make_interval(hours => s.orphan_media_hours)
    returning m.public_id, m.media_type
  ), queued as (
    insert into public.draft_asset_cleanup_queue (public_id, resource_type)
    select public_id, media_type from due
    returning 1
  )
  select count(*) into v_orphans from queued;

  update public.content_media m
  set purged_at = now()
  where m.status = 'deleted' and m.purged_at is null
    and exists (select 1 from public.draft_asset_cleanup_queue q
                where q.public_id = m.public_id and q.status = 'done')
    and not exists (select 1 from public.draft_asset_cleanup_queue q
                    where q.public_id = m.public_id and q.status in ('queued', 'sending'));

  with d as (
    delete from public.content_view where created_at < now() - make_interval(days => s.raw_view_retention_days)
    returning 1
  ) select count(*) into v_views from d;
  with d as (
    delete from public.content_click where created_at < now() - make_interval(days => s.raw_view_retention_days)
    returning 1
  ) select count(*) into v_clicks from d;

  with d as (
    delete from public.content_story_seen ss
    using public.content_post p
    where p.id = ss.post_id and p.kind = 'story' and p.expires_at < now() - interval '60 days'
    returning 1
  ) select count(*) into v_seen from d;

  -- Finished cleanup rows are kept for 30 days for troubleshooting.
  delete from public.draft_asset_cleanup_queue
  where status = 'done' and finished_at < now() - interval '30 days';

  return jsonb_build_object(
    'stories_archived', v_stories, 'media_queued', v_deleted, 'orphans_queued', v_orphans,
    'views_purged', v_views, 'clicks_purged', v_clicks, 'seen_purged', v_seen);
end;
$$;

revoke all on function public.content_housekeeping() from public, anon, authenticated;
grant execute on function public.content_housekeeping() to service_role;

-- ---------------------------------------------------------------------
-- 5. Uploads that were never registered (the app uploaded to Cloudinary
--    but the person left before the post was saved, or registration
--    refused the file) are found by listing the content_media/ folder on
--    Cloudinary once a day; storage_purge_config.content_upload_sweep_at
--    remembers when that sweep last ran.
-- ---------------------------------------------------------------------

-- True at most once per p_min_hours (20 by default): the caller then runs
-- the sweep.
create or replace function public.content_upload_sweep_claim(p_min_hours integer default 20)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.storage_purge_config
    set content_upload_sweep_at = now()
    where id = true
      and (content_upload_sweep_at is null
           or content_upload_sweep_at <= now() - make_interval(hours => greatest(p_min_hours, 0)))
    returning 1
  )
  select exists (select 1 from claimed);
$$;

revoke all on function public.content_upload_sweep_claim(integer) from public, anon, authenticated;
grant execute on function public.content_upload_sweep_claim(integer) to service_role;

-- Queue one Cloudinary asset for destruction (server code only).
create or replace function public.cloudinary_cleanup_enqueue(p_public_id text, p_resource_type text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.draft_asset_cleanup_queue (public_id, resource_type)
  select p_public_id, p_resource_type
  where not exists (
    select 1 from public.draft_asset_cleanup_queue q
    where q.public_id = p_public_id and q.status in ('queued', 'sending')
  );
$$;

revoke all on function public.cloudinary_cleanup_enqueue(text, text) from public, anon, authenticated;
grant execute on function public.cloudinary_cleanup_enqueue(text, text) to service_role;
