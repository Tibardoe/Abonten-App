-- Admin › Discovery: click and "Not interested" rates counted over every
-- recommendation a person could actually see.
--
-- The rates divided by notified + clicked + dismissed only. A pick waiting in
-- a queued push is 'batched' and a pick not yet in a digest is 'candidate';
-- both already show on the For you page and can be dismissed there. Local
-- end-to-end testing showed one dismissal out of five visible picks reported
-- as "Not interested 100%". The denominator now includes candidate and
-- batched. Nothing else in the function changes.

create or replace function public.admin_recommendation_metrics(p_days integer default 14)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select least(greatest(coalesce(p_days, 14), 1), 180) as days,
           now() - make_interval(days => least(greatest(coalesce(p_days, 14), 1), 180)) as since
  ),
  recs as (select r.* from public.recommendation r, params where r.created_at > params.since),
  digests as (select d.* from public.recommendation_digest d, params where d.created_at > params.since),
  skips as (select k.* from public.recommendation_digest_skip k, params where k.created_at > params.since),
  per_user as (
    select d.user_id, d.is_shadow, count(*) as n from digests d group by 1, 2
  )
  select jsonb_build_object(
    'days', (select days from params),
    'settings', (select jsonb_build_object(
                   'enabled', s.recommendations_enabled,
                   'shadowMode', s.recommendations_shadow_mode,
                   'audience', s.recommendations_audience,
                   'promptsEnabled', s.prompts_enabled,
                   'dailyPushCap', s.daily_push_cap,
                   'weeklyPushCap', s.weekly_push_cap,
                   'watermark', s.generate_watermark)
                 from public.discovery_program_setting s where s.id = 1),
    'subscriptions', coalesce((
      select jsonb_object_agg(k.kind, jsonb_build_object('active', k.active, 'paused', k.paused, 'unsubscribed', k.unsubscribed))
      from (select kind,
                   count(*) filter (where status = 'active') as active,
                   count(*) filter (where status = 'paused') as paused,
                   count(*) filter (where status = 'unsubscribed') as unsubscribed
            from public.notification_subscription group by kind) k), '{}'::jsonb),
    'subscriptionsBySource', coalesce((
      select jsonb_object_agg(src.source, src.n)
      from (select source, count(*) as n from public.notification_subscription
            where created_at > (select since from params) group by source) src), '{}'::jsonb),
    'prompts', (
      select jsonb_build_object(
        'shown', coalesce(sum(p.shown_count), 0),
        'accepted', count(*) filter (where p.accepted_at is not null),
        'dismissed', count(*) filter (where p.dismissed_at is not null))
      from public.notification_prompt_state p
      where p.updated_at > (select since from params)),
    'candidatesByReason', coalesce((
      select jsonb_object_agg(x.reason_kind, jsonb_build_object('live', x.live, 'shadow', x.shadow))
      from (select reason_kind,
                   count(*) filter (where not is_shadow) as live,
                   count(*) filter (where is_shadow) as shadow
            from recs group by reason_kind) x), '{}'::jsonb),
    'statusCounts', coalesce((
      select jsonb_object_agg(x.status, x.n)
      from (select status, count(*) as n from recs group by status) x), '{}'::jsonb),
    'suppressedByReason', coalesce((
      select jsonb_object_agg(x.reason, x.n)
      from (select coalesce(suppress_reason, 'unknown') as reason, count(*) as n
            from recs where status = 'suppressed' group by 1) x), '{}'::jsonb),
    'digestsDaily', coalesce((
      select jsonb_agg(jsonb_build_object('date', x.digest_date, 'live', x.live, 'shadow', x.shadow,
                                          'items', x.items, 'opened', x.opened) order by x.digest_date)
      from (select digest_date,
                   count(*) filter (where not is_shadow) as live,
                   count(*) filter (where is_shadow) as shadow,
                   sum(item_count) as items,
                   count(*) filter (where opened_at is not null) as opened
            from digests group by digest_date) x), '[]'::jsonb),
    'deliveryStatus', coalesce((
      select jsonb_object_agg(x.delivery_status, x.n)
      from (select delivery_status, count(*) as n from digests group by 1) x), '{}'::jsonb),
    'perUserDigests', (
      select jsonb_build_object(
        'live', jsonb_build_object(
          'users', count(*) filter (where not is_shadow),
          'p50', percentile_disc(0.5) within group (order by n) filter (where not is_shadow),
          'p95', percentile_disc(0.95) within group (order by n) filter (where not is_shadow),
          'max', max(n) filter (where not is_shadow)),
        'shadow', jsonb_build_object(
          'users', count(*) filter (where is_shadow),
          'p50', percentile_disc(0.5) within group (order by n) filter (where is_shadow),
          'p95', percentile_disc(0.95) within group (order by n) filter (where is_shadow),
          'max', max(n) filter (where is_shadow)))
      from per_user),
    'openRate', (
      select case when count(*) = 0 then null
                  else round(count(*) filter (where opened_at is not null)::numeric / count(*), 4) end
      from digests where not is_shadow and delivery_status = 'sent'),
    'clickRate', (
      select case when count(*) filter (where status in ('candidate', 'batched', 'notified', 'clicked', 'dismissed')) = 0 then null
                  else round(count(*) filter (where status = 'clicked')::numeric
                             / count(*) filter (where status in ('candidate', 'batched', 'notified', 'clicked', 'dismissed')), 4) end
      from recs where not is_shadow),
    'dismissRate', (
      select case when count(*) filter (where status in ('candidate', 'batched', 'notified', 'clicked', 'dismissed')) = 0 then null
                  else round(count(*) filter (where status = 'dismissed')::numeric
                             / count(*) filter (where status in ('candidate', 'batched', 'notified', 'clicked', 'dismissed')), 4) end
      from recs where not is_shadow),
    'skipsByReason', coalesce((
      select jsonb_object_agg(x.key, x.n)
      from (select reason || case when is_shadow then ':shadow' else '' end as key, count(*) as n
            from skips group by 1) x), '{}'::jsonb)
  );
$$;
