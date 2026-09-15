-- Discovery search analytics: type-ahead suggestions.
--
-- search_query_log always accepted surface = 'suggest', but nothing wrote
-- it: neither platform logged type-ahead, and mobile called search_suggest
-- straight from the device. From this change both platforms fetch
-- suggestions through the server (web Server Action, GET
-- /api/mobile/search/suggest), which records one row per suggestion request
-- -- the same columns as a search, still with no user, device, session or IP
-- -- and the first suggestion opened from it.
--
-- admin_search_insights keeps every existing key computed over submitted
-- searches only, and adds `suggestions`: request count, share with no
-- suggestions, share where a suggestion was opened, latency, and splits by
-- platform and opened type. Type-ahead text is a prefix of what someone is
-- typing ("af", "afro", "afrob"), so it gets no top-queries list of its own.

create or replace function public.admin_search_insights(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with all_rows as (
    select * from public.search_query_log
    where created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365))
  ),
  win as (
    select * from all_rows where surface <> 'suggest'
  ),
  sug as (
    select * from all_rows where surface = 'suggest'
  ),
  totals as (
    select count(*) as searches,
           count(*) filter (where zero_results) as zero_results,
           count(*) filter (where clicked_at is not null) as clicks,
           percentile_disc(0.5) within group (order by latency_ms) as p50_ms,
           percentile_disc(0.95) within group (order by latency_ms) as p95_ms
    from win
  ),
  daily as (
    select date_trunc('day', created_at)::date as day,
           count(*) as searches,
           count(*) filter (where zero_results) as zero_results,
           count(*) filter (where clicked_at is not null) as clicks
    from win group by 1
  ),
  top_q as (
    select query_norm, count(*) as searches,
           count(*) filter (where clicked_at is not null) as clicks,
           count(*) filter (where zero_results) as zero_results
    from win where query_norm <> ''
    group by 1 order by 2 desc, 1 limit 20
  ),
  zero_q as (
    select query_norm, count(*) as searches
    from win where zero_results and query_norm <> ''
    group by 1 order by 2 desc, 1 limit 20
  ),
  by_mode as (
    select mode, count(*) as searches,
           count(*) filter (where clicked_at is not null) as clicks
    from win group by 1
  ),
  by_click as (
    select clicked_type, count(*) as clicks
    from win where clicked_type is not null group by 1
  ),
  by_platform as (
    select platform, count(*) as searches from win group by 1
  ),
  sug_totals as (
    select count(*) as requests,
           count(*) filter (where zero_results) as zero_results,
           count(*) filter (where clicked_at is not null) as opened,
           percentile_disc(0.5) within group (order by latency_ms) as p50_ms,
           percentile_disc(0.95) within group (order by latency_ms) as p95_ms
    from sug
  ),
  sug_platform as (
    select platform, count(*) as requests,
           count(*) filter (where clicked_at is not null) as opened
    from sug group by 1
  ),
  sug_click as (
    select clicked_type, count(*) as opened
    from sug where clicked_type is not null group by 1
  )
  select jsonb_build_object(
    'days', least(greatest(coalesce(p_days, 30), 1), 365),
    'totals', (select to_jsonb(t) from totals t),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d), '[]'::jsonb),
    'topQueries', coalesce((select jsonb_agg(to_jsonb(q) order by q.searches desc, q.query_norm) from top_q q), '[]'::jsonb),
    'zeroResultQueries', coalesce((select jsonb_agg(to_jsonb(z) order by z.searches desc, z.query_norm) from zero_q z), '[]'::jsonb),
    'byMode', coalesce((select jsonb_agg(to_jsonb(m)) from by_mode m), '[]'::jsonb),
    'clicksByType', coalesce((select jsonb_agg(to_jsonb(c)) from by_click c), '[]'::jsonb),
    'byPlatform', coalesce((select jsonb_agg(to_jsonb(p)) from by_platform p), '[]'::jsonb),
    'suggestions', jsonb_build_object(
      'totals', (select to_jsonb(t) from sug_totals t),
      'byPlatform', coalesce((select jsonb_agg(to_jsonb(p) order by p.platform) from sug_platform p), '[]'::jsonb),
      'openedByType', coalesce((select jsonb_agg(to_jsonb(c) order by c.clicked_type) from sug_click c), '[]'::jsonb)
    )
  );
$$;

revoke all on function public.admin_search_insights(integer) from public, anon, authenticated;
grant execute on function public.admin_search_insights(integer) to service_role;
