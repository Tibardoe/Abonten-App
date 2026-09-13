-- Discovery: privacy-conscious search analytics.
--
-- Adds:
--   * search_query_log        one row per search (and a sample of web
--                             suggestion calls), with the first click on a
--                             result. NO user id, NO install id, NO session
--                             id: only the normalised query text (<= 120
--                             chars), what kind of search it was, how many
--                             results each group had and how long it took.
--   * search_log_record()     service_role; normalises the query itself
--   * search_log_click()      service_role; first click within an hour only
--   * search_log_purge()      retention (discovery_program_setting decides the
--                             period; 90 days by default)
--   * admin_search_insights() service_role; the admin Discovery › Search panel
--   * pg_cron search-log-purge, daily 03:35
--
-- Access: RLS on, no anon/authenticated privileges. Written only by
-- @abonten/services after a search has run.

create table public.search_query_log (
  id              bigint generated always as identity primary key,
  query_norm      text        not null check (length(query_norm) <= 120),
  mode            text        not null check (mode in ('text', 'organizer', 'browse')),
  surface         text        not null check (surface in ('suggest', 'all', 'events', 'places', 'organizers')),
  platform        text        not null check (platform in ('web', 'ios', 'android')),
  has_location    boolean     not null default false,
  has_filters     boolean     not null default false,
  event_count     smallint    not null default 0 check (event_count >= 0),
  place_count     smallint    not null default 0 check (place_count >= 0),
  organizer_count smallint    not null default 0 check (organizer_count >= 0),
  zero_results    boolean     generated always as (event_count + place_count + organizer_count = 0) stored,
  latency_ms      integer     check (latency_ms is null or latency_ms >= 0),
  clicked_type    text        check (clicked_type in ('event', 'place', 'organizer')),
  clicked_id      uuid,
  clicked_rank    smallint    check (clicked_rank is null or clicked_rank >= 0),
  clicked_at      timestamptz,
  created_at      timestamptz not null default now()
);

comment on table public.search_query_log is
  'Search analytics without personal identifiers: normalised query, result counts, latency, first click. Service role only; purged after the configured retention.';

create index idx_search_query_log_created on public.search_query_log using brin (created_at);
create index idx_search_query_log_query_created on public.search_query_log (query_norm, created_at desc);

alter table public.search_query_log enable row level security;
revoke all on table public.search_query_log from anon, authenticated;
grant select, insert, update, delete on table public.search_query_log to service_role;

create or replace function public.search_log_record(
  p_platform        text,
  p_surface         text,
  p_query           text,
  p_has_location    boolean,
  p_has_filters     boolean,
  p_event_count     integer,
  p_place_count     integer,
  p_organizer_count integer,
  p_latency_ms      integer
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_norm text := public._search_normalize(p_query);
  v_mode text;
  v_id   bigint;
begin
  v_mode := case
    when left(v_norm, 1) = '@' then 'organizer'
    when v_norm = '' then 'browse'
    else 'text'
  end;
  insert into public.search_query_log (
    query_norm, mode, surface, platform, has_location, has_filters,
    event_count, place_count, organizer_count, latency_ms
  ) values (
    v_norm, v_mode, p_surface, p_platform, coalesce(p_has_location, false), coalesce(p_has_filters, false),
    least(greatest(coalesce(p_event_count, 0), 0), 32767),
    least(greatest(coalesce(p_place_count, 0), 0), 32767),
    least(greatest(coalesce(p_organizer_count, 0), 0), 32767),
    case when p_latency_ms is null then null else least(greatest(p_latency_ms, 0), 600000) end
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.search_log_click(
  p_id        bigint,
  p_type      text,
  p_entity_id uuid,
  p_rank      integer
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.search_query_log l
    set clicked_type = p_type,
        clicked_id   = p_entity_id,
        clicked_rank = least(greatest(coalesce(p_rank, 0), 0), 32767),
        clicked_at   = now()
    where l.id = p_id
      and l.clicked_at is null
      and l.created_at > now() - interval '1 hour'
      and p_type in ('event', 'place', 'organizer')
    returning 1
  )
  select exists (select 1 from updated);
$$;

create or replace function public.search_log_purge(p_days integer default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days  integer;
  v_count integer;
begin
  select coalesce(p_days, s.search_log_retention_days, 90)
    into v_days
  from (select 1) one
  left join public.discovery_program_setting s on s.id = 1;

  delete from public.search_query_log
  where created_at < now() - make_interval(days => greatest(v_days, 1));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.admin_search_insights(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with win as (
    select * from public.search_query_log
    where created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365))
      and surface <> 'suggest'
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
  )
  select jsonb_build_object(
    'days', least(greatest(coalesce(p_days, 30), 1), 365),
    'totals', (select to_jsonb(t) from totals t),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d), '[]'::jsonb),
    'topQueries', coalesce((select jsonb_agg(to_jsonb(q) order by q.searches desc, q.query_norm) from top_q q), '[]'::jsonb),
    'zeroResultQueries', coalesce((select jsonb_agg(to_jsonb(z) order by z.searches desc, z.query_norm) from zero_q z), '[]'::jsonb),
    'byMode', coalesce((select jsonb_agg(to_jsonb(m)) from by_mode m), '[]'::jsonb),
    'clicksByType', coalesce((select jsonb_agg(to_jsonb(c)) from by_click c), '[]'::jsonb),
    'byPlatform', coalesce((select jsonb_agg(to_jsonb(p)) from by_platform p), '[]'::jsonb)
  );
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.search_log_record(text, text, text, boolean, boolean, integer, integer, integer, integer)',
    'public.search_log_click(bigint, text, uuid, integer)',
    'public.search_log_purge(integer)',
    'public.admin_search_insights(integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
