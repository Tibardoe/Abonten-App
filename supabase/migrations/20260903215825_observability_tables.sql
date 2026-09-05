-- Admin Console Phase 1 — self-hosted observability (hybrid approach).
--
-- The repo had NO error tracking / telemetry of any kind. Rather than take
-- a hard dependency on a third-party service now, this creates the minimum
-- real pipeline so the Admin "Monitoring" module shows genuine data from
-- day one:
--
--   app_error_event   -- one row per captured error (from packages/core/reportError)
--   app_error_group   -- rollup by fingerprint (trigger-maintained)
--   app_request_metric-- sampled request timings
--   health_check_result -- output of the periodic /api/observability/health run
--   incident          -- minimal incident record
--
-- All write paths run on the service-role client behind
-- @abonten/services/admin/observability/**; a SENTRY_DSN-gated adapter can
-- be added later to ALSO forward to Sentry without changing these tables
-- or the Admin UI (which only reads DTOs from the service layer).
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

-- ============================================================
-- app_error_event  +  app_error_group
-- ============================================================

create table public.app_error_group (
  fingerprint       text primary key,
  title             text not null,
  error_type        text,
  sample_message    text,
  first_seen        timestamptz not null default now(),
  last_seen         timestamptz not null default now(),
  event_count       bigint not null default 0,
  platforms         text[] not null default array[]::text[],
  last_route         text,
  last_app_version   text,
  status            text not null default 'open'
                      check (status in ('open','acknowledged','resolved','ignored')),
  assigned_to       uuid references auth.users(id) on delete set null,
  updated_at        timestamptz not null default now()
);

create index idx_app_error_group_status on public.app_error_group (status, last_seen desc);

create table public.app_error_event (
  id           uuid primary key default extensions.uuid_generate_v4(),
  fingerprint  text not null,
  error_type   text,
  message      text,
  stack        text,
  platform     text not null check (platform in ('web','mobile','api')),
  release      text,
  route        text,
  app_version  text,
  severity     text not null default 'error'
                 check (severity in ('info','warning','error','fatal')),
  context      jsonb,
  user_id      uuid references auth.users(id) on delete set null,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index idx_app_error_event_fingerprint on public.app_error_event (fingerprint, occurred_at desc);
create index idx_app_error_event_occurred    on public.app_error_event (occurred_at desc);
create index idx_app_error_event_platform    on public.app_error_event (platform, occurred_at desc);

create function public.app_error_event_rollup()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $function$
begin
  insert into public.app_error_group as g (
    fingerprint, title, error_type, sample_message,
    first_seen, last_seen, event_count, platforms,
    last_route, last_app_version, updated_at
  )
  values (
    new.fingerprint,
    coalesce(nullif(new.error_type, ''), 'Error')
      || case when new.message is not null then ': ' || left(new.message, 140) else '' end,
    new.error_type, new.message,
    new.occurred_at, new.occurred_at, 1, array[new.platform],
    new.route, new.app_version, now()
  )
  on conflict (fingerprint) do update set
    last_seen         = greatest(g.last_seen, new.occurred_at),
    first_seen        = least(g.first_seen, new.occurred_at),
    event_count       = g.event_count + 1,
    platforms         = (
                         select array(select distinct unnest(g.platforms || array[new.platform]))
                        ),
    last_route         = coalesce(new.route, g.last_route),
    last_app_version   = coalesce(new.app_version, g.last_app_version),
    -- a fresh occurrence reopens a resolved group, leaves ignored alone
    status            = case when g.status = 'resolved' then 'open' else g.status end,
    updated_at        = now();
  return new;
end;
$function$;

create trigger trg_app_error_event_rollup
  after insert on public.app_error_event
  for each row execute function public.app_error_event_rollup();

-- ============================================================
-- app_request_metric  (+ hourly rollup view)
-- ============================================================

create table public.app_request_metric (
  id          uuid primary key default extensions.uuid_generate_v4(),
  platform    text not null check (platform in ('web','mobile','api')),
  route       text,
  method      text,
  status_code integer,
  duration_ms integer,
  ok          boolean not null default true,
  occurred_at timestamptz not null default now()
);

create index idx_app_request_metric_occurred on public.app_request_metric (occurred_at desc);
create index idx_app_request_metric_route    on public.app_request_metric (route, occurred_at desc);

create view public.app_request_metric_hourly as
  select
    date_trunc('hour', occurred_at) as bucket,
    platform,
    count(*)                                                as total,
    count(*) filter (where ok)                              as ok_count,
    count(*) filter (where not ok)                          as err_count,
    percentile_disc(0.5) within group (order by duration_ms) as p50_ms,
    percentile_disc(0.95) within group (order by duration_ms) as p95_ms
  from public.app_request_metric
  group by 1, 2;

-- ============================================================
-- health_check_result
-- ============================================================

create table public.health_check_result (
  id         uuid primary key default extensions.uuid_generate_v4(),
  check_key  text not null,
  ok         boolean not null,
  latency_ms integer,
  detail     jsonb,
  checked_at timestamptz not null default now()
);

create index idx_health_check_result_key on public.health_check_result (check_key, checked_at desc);

-- ============================================================
-- incident (minimal)
-- ============================================================

create table public.incident (
  id          uuid primary key default extensions.uuid_generate_v4(),
  title       text not null,
  status      text not null default 'investigating'
                check (status in ('investigating','identified','monitoring','resolved')),
  severity    text not null default 'medium'
                check (severity in ('low','medium','high','critical')),
  component   text,
  summary     text,
  started_at  timestamptz not null default now(),
  resolved_at timestamptz,
  created_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

create index idx_incident_status on public.incident (status, started_at desc);

-- ============================================================
-- privileges + RLS  (all service-role only)
-- ============================================================

revoke all on public.app_error_group          from anon, authenticated;
revoke all on public.app_error_event          from anon, authenticated;
revoke all on public.app_request_metric       from anon, authenticated;
revoke all on public.app_request_metric_hourly from anon, authenticated;
revoke all on public.health_check_result      from anon, authenticated;
revoke all on public.incident                 from anon, authenticated;

grant all on public.app_error_group          to service_role;
grant all on public.app_error_event          to service_role;
grant all on public.app_request_metric       to service_role;
grant select on public.app_request_metric_hourly to service_role;
grant all on public.health_check_result      to service_role;
grant all on public.incident                 to service_role;

alter table public.app_error_group    enable row level security;
alter table public.app_error_event    enable row level security;
alter table public.app_request_metric enable row level security;
alter table public.health_check_result enable row level security;
alter table public.incident           enable row level security;
