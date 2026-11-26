-- "On Abonten": a moving wall of the hosts and places that are on Abonten
-- (2026-11-26; docs/architecture/showcase.md, handbook docs/admin/showcase.md).
--
-- Staff pick who is on the wall in Admin › Showcase, per market (country)
-- and optionally per launched city. Whether an entry SHOWS is decided on
-- every read, here, so an entry that stops qualifying drops out by itself:
--
--   a host (organizer: a person or a team) shows while the account is
--   active (not deleted, suspended or banned; a team that is not frozen or
--   closed) and has at least one upcoming event in that market that the
--   Explore rule has on (_explore_event_candidates: published, not
--   archived, not postponed, not hidden or removed, in an open market, a
--   date that has not ended) and that is not restricted;
--
--   a place shows while it is published, visible, not permanently closed,
--   in that open market, and run by a real owner: an active account (a
--   team that is not frozen or closed), never a deleted one (a place whose
--   owner is gone is "ownerless"), and not a listing Abonten's own staff
--   put up and nobody has claimed yet.
--
-- Tables (all service-role only: RLS on, no policies, no anon/authenticated
-- privileges):
--   showcase_program_setting  one row: the switch, the audience (staff,
--                             beta, all), the fewest entries a row needs
--                             before it shows (min_per_row, default 4) and
--                             the most a row carries
--   showcase_entry            who is on the wall: a host or a place, per
--                             market, optionally one launched city, in a
--                             staff-set order, with a staff note
--   showcase_daily_count      taps and follows that came from the wall, per
--                             entry per day (the market's calendar)
--
-- Functions (SECURITY DEFINER, search_path '', service role only):
--   _showcase_subject_state   why a host or place would not show (null =
--                             it shows), and its next event; set-based, the
--                             Explore rule called once per kind
--   showcase_wall             the wall for a point (or a market): entries
--                             picked and ordered first, tile fields built
--                             only for those
--   showcase_admin_entries    Admin › Showcase: every entry of a market with
--                             its live eligibility, reason and counts
--   showcase_subject_check    Admin search: would these hosts / places show
--   showcase_entry_add        add an entry at the end of its market's order
--   showcase_entry_move       move an entry one place up or down
--   showcase_count            count a tap, or a follow that matches the
--                             entry's subject
--
-- The rows-below-the-minimum rule ("a wall with 2-3 names looks worse than
-- none") is applied by the reader (@abonten/core/showcase/rules), which
-- this function hands every eligible entry up to max_per_row.
--
-- Ships OFF: showcase_program_setting.enabled = false, audience 'staff',
-- plus the SHOWCASE_KILL_SWITCH env flag on the website (and admin).
-- Nothing is seeded: no entries.
--
-- No existing function is replaced.

begin;

-- ---------------------------------------------------------------------------
-- 1. Settings (one row)
-- ---------------------------------------------------------------------------

create table public.showcase_program_setting (
  id             smallint    primary key default 1 check (id = 1),
  enabled        boolean     not null default false,
  -- staff: active admin_user rows · beta: staff + beta_user_ids · all: everyone
  audience       text        not null default 'staff'
                   check (audience in ('staff', 'beta', 'all')),
  beta_user_ids  uuid[]      not null default '{}',
  -- A row (Hosts, Places) shows only with at least this many entries that
  -- qualify; the section hides when neither row does.
  min_per_row    smallint    not null default 4 check (min_per_row between 1 and 20),
  -- The most entries one row of the moving wall carries.
  max_per_row    smallint    not null default 24 check (max_per_row between 4 and 60),
  updated_at     timestamptz not null default now(),
  updated_by     uuid        references public.user_info (id) on delete set null,
  constraint showcase_program_setting_rows check (min_per_row <= max_per_row)
);

comment on table public.showcase_program_setting is
  'On Abonten showcase switches (one row). Ships off. Edited only from the admin console (service role); SHOWCASE_KILL_SWITCH on the website wins over it.';

insert into public.showcase_program_setting (id) values (1) on conflict (id) do nothing;

create index idx_showcase_program_setting_updated_by
  on public.showcase_program_setting (updated_by) where updated_by is not null;

-- ---------------------------------------------------------------------------
-- 2. Entries
-- ---------------------------------------------------------------------------

create table public.showcase_entry (
  id               uuid        primary key default gen_random_uuid(),
  subject_kind     text        not null check (subject_kind in ('host', 'place')),
  host_account_id  uuid        references public.user_info (id) on delete cascade,
  place_id         uuid        references public.place (id) on delete cascade,
  subject_id       uuid        generated always as (coalesce(host_account_id, place_id)) stored,
  country_code     char(2)     not null references public.market (country_code) on delete cascade,
  -- null: the whole market; else only for people browsing that city.
  region_id        uuid        references public.market_region (id) on delete cascade,
  -- The staff-set order within the market (lower first); gaps are fine.
  position         integer     not null check (position > 0),
  note             text        check (note is null or char_length(note) <= 500),
  created_by       uuid        references public.user_info (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_by       uuid        references public.user_info (id) on delete set null,
  updated_at       timestamptz not null default now(),
  constraint showcase_entry_subject check (
    (subject_kind = 'host' and host_account_id is not null and place_id is null)
    or (subject_kind = 'place' and place_id is not null and host_account_id is null)
  ),
  -- Once per market.
  constraint showcase_entry_once unique (country_code, subject_kind, subject_id),
  constraint showcase_entry_position_key unique (country_code, position)
    deferrable initially deferred
);

create index idx_showcase_entry_host on public.showcase_entry (host_account_id) where host_account_id is not null;
create index idx_showcase_entry_place on public.showcase_entry (place_id) where place_id is not null;
create index idx_showcase_entry_region on public.showcase_entry (region_id) where region_id is not null;
create index idx_showcase_entry_created_by on public.showcase_entry (created_by) where created_by is not null;
create index idx_showcase_entry_updated_by on public.showcase_entry (updated_by) where updated_by is not null;

comment on table public.showcase_entry is
  'On Abonten showcase: a host (organizer account) or a place staff put on the wall of one market, optionally one launched city. Whether it shows is decided on every read (_showcase_subject_state). Service role only.';

-- A city entry names a city of its own market.
create or replace function public._showcase_entry_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.region_id is not null and not exists (
    select 1 from public.market_region r
    where r.id = new.region_id and r.country_code = new.country_code
  ) then
    raise exception 'showcase: that city is not in this market'
      using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_showcase_entry_guard
  before insert or update on public.showcase_entry
  for each row execute function public._showcase_entry_guard();

-- ---------------------------------------------------------------------------
-- 3. Counts
-- ---------------------------------------------------------------------------

create table public.showcase_daily_count (
  entry_id  uuid    not null references public.showcase_entry (id) on delete cascade,
  -- The market's calendar day.
  day       date    not null,
  taps      integer not null default 0 check (taps >= 0),
  follows   integer not null default 0 check (follows >= 0),
  primary key (entry_id, day)
);

comment on table public.showcase_daily_count is
  'On Abonten showcase: taps on a tile and follows made from it, per entry per market day. Removed with its entry. Service role only.';

-- ---------------------------------------------------------------------------
-- 4. Access: service role only
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['showcase_program_setting', 'showcase_entry', 'showcase_daily_count'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Who would show, and why not
-- ---------------------------------------------------------------------------

-- One row per host and place asked about, with the reason it would not show
-- on the wall of market p_country (null = it shows) and its next event:
--   host:  market_closed · account_deleted · account_restricted ·
--          team_paused · no_upcoming_event
--   place: missing · market_closed · other_market · ownerless ·
--          owner_restricted · team_paused · not_published · moderated ·
--          permanently_closed · not_claimed
-- The next event is the Explore rule's (a run of shows once, at its
-- earliest show that is on), not restricted: for a host, its own next event
-- in this market; for a place, the next event held there. The Explore rule
-- runs once per kind for the whole set, and hidden_listing_countries() once.
create or replace function public._showcase_subject_state(
  p_country   text,
  p_host_ids  uuid[],
  p_place_ids uuid[]
)
returns table (
  subject_kind   text,
  subject_id     uuid,
  reason         text,
  next_event_id  uuid,
  next_start     timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hidden boolean := p_country = any ((select public.hidden_listing_countries())::text[]);
  v_hosts  uuid[]  := coalesce(p_host_ids, '{}'::uuid[]);
  v_places uuid[]  := coalesce(p_place_ids, '{}'::uuid[]);
begin
  return query
  with host_events as materialized (
    select coalesce(array_agg(e.id), '{}'::uuid[]) as ids
    from public.event e
    where e.organizer_id = any (v_hosts)
      and e.country_code = p_country
      and e.status = 'published'
      and e.archived_at is null
      and e.postponed_at is null
      and coalesce(e.moderation_state, 'visible') = 'visible'
  ),
  place_events as materialized (
    select coalesce(array_agg(e.id), '{}'::uuid[]) as ids
    from public.event e
    where e.place_id = any (v_places)
      and e.status = 'published'
      and e.archived_at is null
      and e.postponed_at is null
      and coalesce(e.moderation_state, 'visible') = 'visible'
  ),
  -- The Explore rule, once for every host's events and once for every
  -- place's (never once per row), and not at all when there is nothing to
  -- ask about (the lateral call runs only for a non-empty list). Two calls,
  -- because a run of shows is listed once at its earliest show: a host's
  -- next show and a venue's next show of the same run can be different
  -- shows.
  host_on as materialized (
    select c.id, c.organizer_id, c.sort_start
    from host_events he
    cross join lateral public._explore_event_candidates(
      null, null, null,
      p_with_distance => false,
      p_only_ids => he.ids
    ) c
    where cardinality(he.ids) > 0
  ),
  place_on as materialized (
    select c.id, e.place_id, c.sort_start
    from place_events pe
    cross join lateral public._explore_event_candidates(
      null, null, null,
      p_with_distance => false,
      p_only_ids => pe.ids
    ) c
    join public.event e on e.id = c.id
    where cardinality(pe.ids) > 0
  ),
  host_next as (
    select distinct on (h.organizer_id) h.organizer_id, h.id, h.sort_start
    from host_on h
    order by h.organizer_id, h.sort_start, h.id
  ),
  place_next as (
    select distinct on (p.place_id) p.place_id, p.id, p.sort_start
    from place_on p
    order by p.place_id, p.sort_start, p.id
  )
  select 'host'::text,
         hid,
         case
           when v_hidden then 'market_closed'
           when u.id is null or u.status_id = 4 then 'account_deleted'
           when u.status_id <> 1 then 'account_restricted'
           when u.account_kind = 'team' and coalesce(t.status, 'closed') <> 'active' then 'team_paused'
           when hn.id is null then 'no_upcoming_event'
         end,
         hn.id,
         hn.sort_start
  from unnest(v_hosts) as hid
  left join public.user_info u on u.id = hid
  left join public.team t on t.account_id = hid
  left join host_next hn on hn.organizer_id = hid
  union all
  select 'place'::text,
         pid,
         case
           when p.id is null then 'missing'
           when v_hidden then 'market_closed'
           when p.country_code <> p_country then 'other_market'
           when o.id is null or o.status_id = 4 then 'ownerless'
           when o.status_id <> 1 then 'owner_restricted'
           when o.account_kind = 'team' and coalesce(ot.status, 'closed') <> 'active' then 'team_paused'
           when p.status <> 'published' then 'not_published'
           when p.moderation_state in ('restricted', 'hidden', 'removed') then 'moderated'
           when p.temporary_status = 'permanently_closed' then 'permanently_closed'
           -- Put up by Abonten's own staff and never claimed: nobody runs it.
           when not p.claimed and exists (
             select 1 from public.admin_user au
             where au.user_id = p.owner_id and au.status = 'active'
           ) then 'not_claimed'
         end,
         pn.id,
         pn.sort_start
  from unnest(v_places) as pid
  left join public.place p on p.id = pid
  left join public.user_info o on o.id = p.owner_id
  left join public.team ot on ot.account_id = p.owner_id
  left join place_next pn on pn.place_id = pid;
end;
$$;

comment on function public._showcase_subject_state(text, uuid[], uuid[]) is
  'On Abonten showcase: why each host / place would not show on market p_country''s wall (null = it shows) and its next event by the Explore rule. Set-based. Service role only.';

-- ---------------------------------------------------------------------------
-- 6. The wall
-- ---------------------------------------------------------------------------

-- The wall for a reader at a point, or for a market:
--   * the market is p_country_code when given, else the country of the
--     launched city (market_region) whose radius holds the point, else the
--     default market; the city is that region (an explicit market has no
--     city unless the point falls in one of its cities);
--   * entries are that market's, for the whole market or for that city,
--     in the staff order; the ones that qualify are picked first, up to
--     p_limit per row (hosts, places), and only those get tile fields;
--   * p_viewer (the signed-in person, or null) fills `following`.
-- Returns { countryCode, regionId, regionName, hosts: [...], places: [...] }.
create or replace function public.showcase_wall(
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_country_code text default null,
  p_viewer       uuid default null,
  p_limit        integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit   integer := least(greatest(coalesce(p_limit, 24), 1), 200);
  v_country text := upper(nullif(btrim(coalesce(p_country_code, '')), ''));
  v_region  public.market_region;
  v_point   extensions.geography;
  v_hosts   jsonb;
  v_places  jsonb;
begin
  if p_lat is not null and p_lng is not null then
    v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
    select r.* into v_region
    from public.market_region r
    where r.status = 'active'
      and (v_country is null or r.country_code = v_country)
      and extensions.st_dwithin(
            extensions.st_setsrid(extensions.st_makepoint(r.centre_lng, r.centre_lat), 4326)::extensions.geography,
            v_point, (r.radius_km * 1000)::double precision)
    order by extensions.st_distance(
               extensions.st_setsrid(extensions.st_makepoint(r.centre_lng, r.centre_lat), 4326)::extensions.geography,
               v_point),
             r.id
    limit 1;
  end if;

  if v_country is null then
    v_country := coalesce(v_region.country_code,
                          (select m.country_code from public.market m where m.is_default));
  end if;
  if v_country is null or not exists (select 1 from public.market m where m.country_code = v_country) then
    return jsonb_build_object('countryCode', v_country, 'regionId', null, 'regionName', null,
                              'hosts', '[]'::jsonb, 'places', '[]'::jsonb);
  end if;

  with entries as materialized (
    select se.id, se.subject_kind, se.host_account_id, se.place_id, se.subject_id, se.position
    from public.showcase_entry se
    where se.country_code = v_country
      and (se.region_id is null or se.region_id = v_region.id)
  ),
  state as materialized (
    select s.*
    from public._showcase_subject_state(
      v_country,
      (select coalesce(array_agg(en.host_account_id), '{}'::uuid[]) from entries en where en.subject_kind = 'host'),
      (select coalesce(array_agg(en.place_id), '{}'::uuid[]) from entries en where en.subject_kind = 'place')
    ) s
  ),
  picked as materialized (
    select x.*
    from (
      select en.id as entry_id, en.subject_kind, en.subject_id, en.position,
             st.next_event_id, st.next_start,
             row_number() over (partition by en.subject_kind order by en.position, en.id) as rn
      from entries en
      join state st on st.subject_kind = en.subject_kind and st.subject_id = en.subject_id
      where st.reason is null
    ) x
    where x.rn <= v_limit
  ),
  -- The next event's own fields, for the picked tiles only: the date that
  -- matched (an event with several dates: the one that is on next).
  next_event as (
    select pk.entry_id,
           jsonb_build_object(
             'id', e.id,
             'event_code', e.event_code,
             'title', e.title,
             'starts_at', pk.next_start,
             'ends_at', coalesce(
               (select o.ends_at from public.event_occurrence o
                where o.event_id = e.id and o.starts_at = pk.next_start and o.ends_at > now()
                order by o.ends_at limit 1),
               e.ends_at),
             'timezone', e.timezone
           ) as data
    from picked pk
    join public.event e on e.id = pk.next_event_id
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'entry_id', pk.entry_id,
        'kind', 'host',
        'subject_id', u.id,
        'username', u.username,
        'full_name', u.full_name,
        'username_is_generated', u.username_is_generated,
        'avatar_public_id', u.avatar_public_id,
        'avatar_version', u.avatar_version,
        'verified', u.organizer_verified and u.status_id = 1,
        'is_team', u.account_kind = 'team',
        'following', p_viewer is not null and exists (
          select 1 from public.follow f
          where f.follower_id = p_viewer and f.target_kind = 'organizer' and f.target_id = u.id),
        'next_event', ne.data
      ) order by pk.position, pk.entry_id
    ) filter (where pk.subject_kind = 'host'), '[]'::jsonb),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'entry_id', pk.entry_id,
        'kind', 'place',
        'subject_id', p.id,
        'owner_id', p.owner_id,
        'name', p.name,
        'slug', p.slug,
        'cover_public_id', p.cover_public_id,
        'cover_version', p.cover_version,
        'verified', p.verified,
        'category_id', p.category_id,
        'category_name', pc.name,
        'category_slug', pc.slug,
        'area', coalesce(
          nullif(btrim(p.address ->> 'city'), ''),
          (select r.name from public.market_region r
           where r.country_code = p.country_code and r.status = 'active'
             and extensions.st_dwithin(
                   extensions.st_setsrid(extensions.st_makepoint(r.centre_lng, r.centre_lat), 4326)::extensions.geography,
                   p.location, (r.radius_km * 1000)::double precision)
           order by extensions.st_distance(
                      extensions.st_setsrid(extensions.st_makepoint(r.centre_lng, r.centre_lat), 4326)::extensions.geography,
                      p.location)
           limit 1)),
        -- Only asked when there is no next event to show instead.
        'open_now', case when ne.data is null then public.place_is_open_now(p.id) end,
        'following', p_viewer is not null and exists (
          select 1 from public.follow f
          where f.follower_id = p_viewer and f.target_kind = 'place' and f.target_id = p.id),
        'next_event', ne.data
      ) order by pk.position, pk.entry_id
    ) filter (where pk.subject_kind = 'place'), '[]'::jsonb)
  into v_hosts, v_places
  from picked pk
  left join public.user_info u on pk.subject_kind = 'host' and u.id = pk.subject_id
  left join public.place p on pk.subject_kind = 'place' and p.id = pk.subject_id
  left join public.place_category pc on pc.id = p.category_id
  left join next_event ne on ne.entry_id = pk.entry_id;

  return jsonb_build_object(
    'countryCode', v_country,
    'regionId', v_region.id,
    'regionName', v_region.name,
    'hosts', v_hosts,
    'places', v_places
  );
end;
$$;

comment on function public.showcase_wall(double precision, double precision, text, uuid, integer) is
  'On Abonten showcase: the hosts and places that qualify for the wall of a market (and city), in staff order, up to p_limit per row, with tile fields and the viewer''s follow state. Programme and audience are checked by @abonten/services/showcase first. Service role only.';

-- ---------------------------------------------------------------------------
-- 7. Admin › Showcase
-- ---------------------------------------------------------------------------

-- Every entry of a market, in order, with what it is, whether it shows now
-- and why not, its next event, and the last 7 and 30 days' counts.
create or replace function public.showcase_admin_entries(p_country_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_country text := upper(btrim(coalesce(p_country_code, '')));
  v_tz      text;
  v_today   date;
  v_out     jsonb;
begin
  select m.default_timezone into v_tz from public.market m where m.country_code = v_country;
  if v_tz is null then
    return '[]'::jsonb;
  end if;
  v_today := (now() at time zone v_tz)::date;

  with entries as materialized (
    select se.*
    from public.showcase_entry se
    where se.country_code = v_country
  ),
  state as materialized (
    select s.*
    from public._showcase_subject_state(
      v_country,
      (select coalesce(array_agg(en.host_account_id), '{}'::uuid[]) from entries en where en.subject_kind = 'host'),
      (select coalesce(array_agg(en.place_id), '{}'::uuid[]) from entries en where en.subject_kind = 'place')
    ) s
  ),
  counts as (
    select c.entry_id,
           sum(c.taps) filter (where c.day > v_today - 7)     as taps_7,
           sum(c.follows) filter (where c.day > v_today - 7)  as follows_7,
           sum(c.taps) filter (where c.day > v_today - 30)    as taps_30,
           sum(c.follows) filter (where c.day > v_today - 30) as follows_30,
           sum(c.taps)    as taps_all,
           sum(c.follows) as follows_all
    from public.showcase_daily_count c
    where c.entry_id in (select en.id from entries en)
    group by c.entry_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', en.id,
      'subject_kind', en.subject_kind,
      'subject_id', en.subject_id,
      'position', en.position,
      'region_id', en.region_id,
      'region_name', r.name,
      'note', en.note,
      'created_at', en.created_at,
      'updated_at', en.updated_at,
      'reason', st.reason,
      'name', case when en.subject_kind = 'host'
                   then coalesce(nullif(btrim(u.full_name), ''), u.username::text)
                   else p.name end,
      'username', u.username,
      'slug', p.slug,
      'image_public_id', coalesce(u.avatar_public_id, p.cover_public_id),
      'image_version', coalesce(u.avatar_version, p.cover_version),
      'verified', case when en.subject_kind = 'host'
                       then coalesce(u.organizer_verified and u.status_id = 1, false)
                       else coalesce(p.verified, false) end,
      'is_team', coalesce(u.account_kind = 'team', false),
      'next_event', case when ne.id is null then null else jsonb_build_object(
                     'id', ne.id, 'event_code', ne.event_code, 'title', ne.title,
                     'starts_at', st.next_start, 'timezone', ne.timezone) end,
      'counts', jsonb_build_object(
                  'taps7', coalesce(ct.taps_7, 0), 'follows7', coalesce(ct.follows_7, 0),
                  'taps30', coalesce(ct.taps_30, 0), 'follows30', coalesce(ct.follows_30, 0),
                  'tapsAll', coalesce(ct.taps_all, 0), 'followsAll', coalesce(ct.follows_all, 0))
    ) order by en.position, en.id
  ), '[]'::jsonb)
  into v_out
  from entries en
  left join state st on st.subject_kind = en.subject_kind and st.subject_id = en.subject_id
  left join public.user_info u on en.subject_kind = 'host' and u.id = en.host_account_id
  left join public.place p on en.subject_kind = 'place' and p.id = en.place_id
  left join public.market_region r on r.id = en.region_id
  left join public.event ne on ne.id = st.next_event_id
  left join counts ct on ct.entry_id = en.id;

  return v_out;
end;
$$;

comment on function public.showcase_admin_entries(text) is
  'Admin › Showcase: every entry of a market in order, with its live eligibility (reason null = shows), next event and tap/follow counts. Service role only (the console checks showcase.view).';

-- Would these hosts / places show on market p_country_code's wall? For the
-- console's search, before anyone is added.
create or replace function public.showcase_subject_check(
  p_country_code text,
  p_host_ids     uuid[] default null,
  p_place_ids    uuid[] default null
)
returns table (subject_kind text, subject_id uuid, reason text, next_event_id uuid, next_start timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.subject_kind, s.subject_id, s.reason, s.next_event_id, s.next_start
  from public._showcase_subject_state(upper(btrim(coalesce(p_country_code, ''))), p_host_ids, p_place_ids) s;
$$;

comment on function public.showcase_subject_check(text, uuid[], uuid[]) is
  'Admin › Showcase search: why each host / place would not show on a market''s wall (null = it would). Service role only.';

-- Add an entry at the end of its market's order. A subject is on a market's
-- wall once; a place must be in that market. Returns the new entry id.
create or replace function public.showcase_entry_add(
  p_subject_kind text,
  p_subject_id   uuid,
  p_country_code text,
  p_region_id    uuid default null,
  p_note         text default null,
  p_actor        uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_country text := upper(btrim(coalesce(p_country_code, '')));
  v_id      uuid;
begin
  if p_subject_kind not in ('host', 'place') then
    raise exception 'showcase: unknown kind' using errcode = '22023';
  end if;
  if not exists (select 1 from public.market m where m.country_code = v_country) then
    raise exception 'showcase: unknown market' using errcode = '22023';
  end if;
  if p_subject_kind = 'host' and not exists (
    select 1 from public.user_info u where u.id = p_subject_id and u.status_id <> 4
  ) then
    raise exception 'showcase: that account does not exist' using errcode = 'P0002';
  end if;
  if p_subject_kind = 'place' then
    if not exists (select 1 from public.place p where p.id = p_subject_id) then
      raise exception 'showcase: that place does not exist' using errcode = 'P0002';
    end if;
    if not exists (select 1 from public.place p where p.id = p_subject_id and p.country_code = v_country) then
      raise exception 'showcase: that place is in another market' using errcode = '22023';
    end if;
  end if;

  -- One writer of a market's order at a time.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('showcase_entry:' || v_country));

  if exists (select 1 from public.showcase_entry se
             where se.country_code = v_country and se.subject_kind = p_subject_kind
               and se.subject_id = p_subject_id) then
    raise exception 'showcase: already on this market''s wall' using errcode = '23505';
  end if;

  insert into public.showcase_entry (
    subject_kind, host_account_id, place_id, country_code, region_id, position,
    note, created_by, updated_by)
  values (
    p_subject_kind,
    case when p_subject_kind = 'host' then p_subject_id end,
    case when p_subject_kind = 'place' then p_subject_id end,
    v_country,
    p_region_id,
    coalesce((select max(se.position) from public.showcase_entry se where se.country_code = v_country), 0) + 1,
    nullif(btrim(coalesce(p_note, '')), ''),
    p_actor,
    p_actor)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.showcase_entry_add(text, uuid, text, uuid, text, uuid) is
  'Admin › Showcase: put a host or a place on a market''s wall, last in its order. The console checks showcase.edit and audits. Service role only.';

-- Move an entry one place up (earlier) or down in its market's order: it
-- swaps positions with its neighbour. Returns false at either end.
create or replace function public.showcase_entry_move(
  p_entry_id  uuid,
  p_direction text,
  p_actor     uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.showcase_entry;
  v_other public.showcase_entry;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'showcase: direction is up or down' using errcode = '22023';
  end if;
  select * into v_entry from public.showcase_entry where id = p_entry_id;
  if not found then
    raise exception 'showcase: no such entry' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('showcase_entry:' || v_entry.country_code));
  select * into v_entry from public.showcase_entry where id = p_entry_id;

  if p_direction = 'up' then
    select * into v_other from public.showcase_entry se
    where se.country_code = v_entry.country_code and se.position < v_entry.position
    order by se.position desc limit 1;
  else
    select * into v_other from public.showcase_entry se
    where se.country_code = v_entry.country_code and se.position > v_entry.position
    order by se.position asc limit 1;
  end if;
  if v_other.id is null then
    return false;
  end if;

  -- The position key is deferred: the swap is checked at commit.
  update public.showcase_entry
     set position = case when id = v_entry.id then v_other.position else v_entry.position end,
         updated_by = p_actor
   where id in (v_entry.id, v_other.id);
  return true;
end;
$$;

comment on function public.showcase_entry_move(uuid, text, uuid) is
  'Admin › Showcase: move an entry one place up or down in its market''s order. The console checks showcase.edit and audits. Service role only.';

-- ---------------------------------------------------------------------------
-- 8. Counting taps and follows
-- ---------------------------------------------------------------------------

-- Count one tap on an entry's tile, or one follow made from it, on the
-- market's calendar day. A follow counts only when the target is the
-- entry's subject (an organizer follow for a host entry, a place follow for
-- a place entry). Returns false when nothing was counted.
create or replace function public.showcase_count(
  p_entry_id    uuid,
  p_kind        text,
  p_target_kind text default null,
  p_target_id   uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.showcase_entry;
  v_day   date;
begin
  if p_kind not in ('tap', 'follow') then
    raise exception 'showcase: count a tap or a follow' using errcode = '22023';
  end if;
  select * into v_entry from public.showcase_entry where id = p_entry_id;
  if not found then
    return false;
  end if;
  if p_kind = 'follow' and not (
    p_target_id = v_entry.subject_id
    and ((v_entry.subject_kind = 'host' and p_target_kind = 'organizer')
         or (v_entry.subject_kind = 'place' and p_target_kind = 'place'))
  ) then
    return false;
  end if;

  select (now() at time zone m.default_timezone)::date into v_day
  from public.market m where m.country_code = v_entry.country_code;
  v_day := coalesce(v_day, (now() at time zone 'UTC')::date);

  insert into public.showcase_daily_count as c (entry_id, day, taps, follows)
  values (v_entry.id, v_day,
          case when p_kind = 'tap' then 1 else 0 end,
          case when p_kind = 'follow' then 1 else 0 end)
  on conflict (entry_id, day) do update
    set taps = c.taps + excluded.taps,
        follows = c.follows + excluded.follows;
  return true;
end;
$$;

comment on function public.showcase_count(uuid, text, text, uuid) is
  'On Abonten showcase: count a tap on a tile or a follow made from it (the follow only when it targets the entry''s subject), per market day. Called by @abonten/services after its own checks. Service role only.';

-- ---------------------------------------------------------------------------
-- 9. Function privileges: service role only
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public._showcase_entry_guard()',
    'public._showcase_subject_state(text, uuid[], uuid[])',
    'public.showcase_wall(double precision, double precision, text, uuid, integer)',
    'public.showcase_admin_entries(text)',
    'public.showcase_subject_check(text, uuid[], uuid[])',
    'public.showcase_entry_add(text, uuid, text, uuid, text, uuid)',
    'public.showcase_entry_move(uuid, text, uuid)',
    'public.showcase_count(uuid, text, text, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Permissions (the live matrix; super_admin has every key in code)
-- ---------------------------------------------------------------------------

insert into public.admin_permission (key, label, description) values
  ('showcase.view', 'View the On Abonten showcase',
     'See who is on the On Abonten wall of each market, whether each entry shows right now (and why not), and the taps and follows it brought.'),
  ('showcase.edit', 'Edit the On Abonten showcase',
     'Add hosts and places to a market''s wall, set their order, city and note, remove them, and change the programme settings (switching it on also needs a fresh sign-in).')
on conflict (key) do nothing;

insert into public.admin_role_permission (role_key, permission_key) values
  ('operations',        'showcase.view'),
  ('operations',        'showcase.edit'),
  ('moderator',         'showcase.view'),
  ('moderator',         'showcase.edit'),
  ('support_admin',     'showcase.view'),
  ('analyst',           'showcase.view'),
  ('field_ops_manager', 'showcase.view')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 11. Checks
-- ---------------------------------------------------------------------------

do $$
declare
  v_bad text;
begin
  if (select enabled from public.showcase_program_setting where id = 1) then
    raise exception 'migration check: the showcase must ship switched off';
  end if;
  if (select audience from public.showcase_program_setting where id = 1) <> 'staff' then
    raise exception 'migration check: the showcase must ship to staff only';
  end if;

  select string_agg(c.relname, ', ') into v_bad
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('showcase_program_setting', 'showcase_entry', 'showcase_daily_count')
    and (not c.relrowsecurity
         or pg_catalog.has_table_privilege('anon', c.oid, 'select')
         or pg_catalog.has_table_privilege('authenticated', c.oid, 'select')
         or pg_catalog.has_table_privilege('authenticated', c.oid, 'insert'));
  if v_bad is not null then
    raise exception 'migration check: clients can reach %', v_bad;
  end if;

  select string_agg(p.proname, ', ') into v_bad
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (p.proname like 'showcase\_%' or p.proname like '\_showcase\_%')
    and (pg_catalog.has_function_privilege('anon', p.oid, 'execute')
         or pg_catalog.has_function_privilege('authenticated', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'migration check: clients can execute %', v_bad;
  end if;

  if (select count(*) from public.admin_permission where key in ('showcase.view', 'showcase.edit')) <> 2 then
    raise exception 'migration check: the showcase permissions are missing';
  end if;
end;
$$;

commit;
