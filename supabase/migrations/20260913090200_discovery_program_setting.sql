-- Discovery programme switches and admin permissions.
--
-- Adds:
--   * discovery_program_setting  one row; ships OFF (new search for staff only
--                                once enabled, recommendations off and in
--                                shadow, prompts off). Edited only from the
--                                admin console (service role), every change
--                                audited. The web deployment's
--                                SEARCH_V2_KILL_SWITCH / RECOMMENDATIONS_KILL_SWITCH
--                                env flags win over this row.
--   * permissions discovery.view (read search insights and recommendation
--     metrics) and discovery.configure (change the switches; step-up)
--   * pg_cron search-log-purge, daily 03:35

create table public.discovery_program_setting (
  id                            smallint    primary key default 1 check (id = 1),
  -- Search
  search_v2_enabled             boolean     not null default false,
  -- staff: active admin_user rows only · beta: staff + beta_user_ids · all: everyone
  search_audience               text        not null default 'staff'
                                  check (search_audience in ('staff', 'beta', 'all')),
  organizer_search_enabled      boolean     not null default true,
  place_search_enabled          boolean     not null default true,
  search_logging_enabled        boolean     not null default true,
  search_log_retention_days     integer     not null default 90 check (search_log_retention_days between 7 and 730),
  -- Recommendations
  recommendations_enabled       boolean     not null default false,
  recommendations_shadow_mode   boolean     not null default true,
  recommendations_audience      text        not null default 'staff'
                                  check (recommendations_audience in ('staff', 'beta', 'all')),
  prompts_enabled               boolean     not null default false,
  beta_user_ids                 uuid[]      not null default '{}',
  daily_push_cap                smallint    not null default 1  check (daily_push_cap between 0 and 5),
  weekly_push_cap               smallint    not null default 3  check (weekly_push_cap between 0 and 14),
  organizer_cooldown_hours      integer     not null default 72 check (organizer_cooldown_hours between 0 and 720),
  similar_default_radius_km     numeric     not null default 25 check (similar_default_radius_km between 1 and 200),
  candidate_ttl_days            smallint    not null default 7  check (candidate_ttl_days between 1 and 30),
  ignore_pause_after            smallint    not null default 3  check (ignore_pause_after between 1 and 20),
  ignore_pause_days             smallint    not null default 14 check (ignore_pause_days between 1 and 90),
  digest_hour_local             smallint    not null default 18 check (digest_hour_local between 8 and 20),
  prompt_cooldown_days          smallint    not null default 7  check (prompt_cooldown_days between 0 and 90),
  prompt_dismiss_days           smallint    not null default 30 check (prompt_dismiss_days between 1 and 365),
  prompt_max_shows              smallint    not null default 3  check (prompt_max_shows between 1 and 20),
  recommendation_retention_days integer     not null default 90 check (recommendation_retention_days between 7 and 730),
  -- Only events/places published after this moment are ever recommended.
  generate_watermark            timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  updated_by                    uuid
);

comment on table public.discovery_program_setting is
  'Discovery switches (one row): unified search, recommendation notifications, opt-in prompts, caps. Ships off. Edited only from the admin console (service role).';

insert into public.discovery_program_setting (id) values (1) on conflict do nothing;

revoke all on public.discovery_program_setting from anon, authenticated;
grant all on public.discovery_program_setting to service_role;
alter table public.discovery_program_setting enable row level security;

insert into public.admin_permission (key, label, description) values
  ('discovery.view',      'View discovery insights',
     'See search analytics, subscription counts and recommendation metrics, including shadow-mode projections.'),
  ('discovery.configure', 'Configure discovery',
     'Turn unified search, recommendation notifications and opt-in prompts on or off and change caps. Requires step-up.')
on conflict (key) do nothing;

-- super_admin is granted everything in code (its rows are immutable).
insert into public.admin_role_permission (role_key, permission_key) values
  ('operations', 'discovery.view'),
  ('operations', 'discovery.configure'),
  ('analyst',    'discovery.view')
on conflict do nothing;

select cron.unschedule('search-log-purge')
where exists (select 1 from cron.job where jobname = 'search-log-purge');

select cron.schedule(
  'search-log-purge',
  '35 3 * * *',
  $$select public.search_log_purge();$$
);
