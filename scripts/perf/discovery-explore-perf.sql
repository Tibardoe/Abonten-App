-- Discovery performance harness, part 4: the Explore lists
-- (get_filtered_events, get_nearby_events, get_explore_event_sections,
-- get_similar_events, get_events_in_window, get_place_events,
-- get_filtered_places, get_nearby_places).
-- Runs after discovery-perf-seed.sql in the same psql session and ROLLS BACK.
-- See scripts/perf/README.md.
--
-- The seed has no ticket tiers, no multi-date events, no reviews and no
-- opening hours, and every listing is in one city. Added here:
--   * one ticket tier per event (free to 200), a second for every third
--   * 2,000 multi-date events (three dates, no date of their own, as the
--     app stores them)
--   * 20,000 event reviews, 10,000 place reviews, 1,800 organizer reviews
--   * opening hours for four places in five
--   * 40 featured events
--   * a second, small city (300 events, 100 places around Kumasi) so an
--     area with few listings can be timed beside the crowded one
-- Row triggers are off for the load (notices, counters, guards).
--
-- Times each function as installed: 12 runs per case after two warm-ups,
-- as the anon role. To compare a new body, pipe its migration between the
-- seed and this script.

set local session_replication_role = replica;

insert into public.ticket_type (event_id, type, price, quantity, currency)
select e.id, case when e.n % 9 = 0 then 'FREE' else 'General' end, (e.n % 9) * 25, 100, 'GHS'
from (select id, (row_number() over (order by slug))::int as n
      from public.event where slug like 'perf-event-%') e;

insert into public.ticket_type (event_id, type, price, quantity, currency)
select e.id, 'VIP', 100 + (e.n % 7) * 50, 20, 'GHS'
from (select id, (row_number() over (order by slug))::int as n
      from public.event where slug like 'perf-event-%') e
where e.n % 3 = 0;

create temp table perf_multi on commit drop as
select e.id, e.n
from (select id, (row_number() over (order by slug))::int as n
      from public.event where slug like 'perf-event-%') e
where e.n % 50 = 0;

insert into public.event_occurrence (event_id, starts_at, ends_at)
select m.id,
       now() + (k * 7 + (m.n % 30) - 5) * interval '1 day',
       now() + (k * 7 + (m.n % 30) - 5) * interval '1 day' + interval '4 hours'
from perf_multi m
cross join generate_series(0, 2) k;

update public.event e set starts_at = null, ends_at = null
from perf_multi m where m.id = e.id;

update public.event e set featured = true
where e.slug like 'perf-event-%'
  and (('x' || substr(md5(e.slug), 1, 4))::bit(16)::int % 2500) = 0;

insert into public.event_review (event_id, reviewer_id, rating, status)
select e.id, o.id, 3 + (e.n % 3), 'approved'
from (select id, (row_number() over (order by slug))::int as n
      from public.event where slug like 'perf-event-%') e
join perf_orgs o on o.n = 1 + (e.n % 2000)
where e.n % 5 = 0;

insert into public.place_review (place_id, reviewer_id, rating, status)
select p.id, o.id, 3 + (p.n % 3), 'approved'
from (select id, (row_number() over (order by slug))::int as n
      from public.place where slug like 'perf-place-%') p
join perf_orgs o on o.n = 1 + (p.n % 2000)
where p.n % 2 = 0;

-- Three reviews for every third organizer.
insert into public.review (reviewer_id, reviewed_id, rating, status, title)
select r.id, o.id, 3 + ((o.n + k) % 3), 'approved', 'Perf review'
from perf_orgs o
cross join generate_series(0, 2) k
join perf_people r on r.n = o.n * 3 + k
where o.n % 3 = 0 and o.n <= 1800;

-- Opening hours: every day 08:00 to 22:00, a late bar in ten (18:00 to
-- 02:00), closed on the day the place number picks. One place in five has
-- no hours, and neither has any place of kind 14, so "open now" for that
-- kind finds nothing at any time of day and asks every place in range.
insert into public.place_opening_hours (place_id, day_of_week, open_time, close_time, is_closed)
select p.id, d,
       case when p.n % 10 = 1 then time '18:00' else time '08:00' end,
       case when p.n % 10 = 1 then time '02:00' else time '22:00' end,
       d = p.n % 7
from (select id, category_id, (row_number() over (order by slug))::int as n
      from public.place where slug like 'perf-place-%') p
cross join generate_series(0, 6) d
where p.n % 5 <> 0 and p.category_id <> 14;

-- A second, small city.
insert into public.event (
  organizer_id, event_category, event_type, title, slug, description, location, address,
  flyer_public_id, flyer_version, starts_at, ends_at, status, event_code, capacity, published_at,
  country_code, timezone, currency
)
select
  o.id,
  (array['Music & Concerts','Arts, Culture & Theatre','Entertainment & Shows','Food & Drink','Sports & Fitness'])[1 + (g % 5)],
  '["Live Concerts"]',
  'Kumasi Perf ' || g,
  'perf-event-k-' || g,
  'A small-city event.',
  extensions.st_setsrid(extensions.st_makepoint(-1.66 + random() * 0.08, 6.65 + random() * 0.08), 4326)::extensions.geography,
  jsonb_build_object('full_address', 'Kumasi, Ghana'),
  'perf/flyer', '1',
  now() + ((g % 120) - 10) * interval '1 day',
  now() + ((g % 120) - 10) * interval '1 day' + interval '4 hours',
  'published',
  'K' || lpad(g::text, 7, '0'),
  200,
  now() - interval '30 days',
  'GH', 'Africa/Accra', 'GHS'
from generate_series(1, 300) g
join perf_orgs o on o.n = 1 + (g % 2000);

insert into public.ticket_type (event_id, type, price, quantity, currency)
select e.id, 'General', 30, 100, 'GHS'
from public.event e where e.slug like 'perf-event-k-%';

insert into public.place (owner_id, name, slug, description, category_id, location, address, cover_public_id, cover_version, status, published_at, country_code, timezone)
select
  o.id, 'Kumasi Perf Place ' || g, 'perf-place-k-' || g, 'A small-city place.', 1 + (g % 14),
  extensions.st_setsrid(extensions.st_makepoint(-1.66 + random() * 0.08, 6.65 + random() * 0.08), 4326)::extensions.geography,
  jsonb_build_object('full_address', 'Kumasi, Ghana'),
  'perf/cover', '1', 'published', now() - interval '30 days', 'GH', 'Africa/Accra'
from generate_series(1, 100) g
join perf_orgs o on o.n = 1 + (g % 2000);

set local session_replication_role = origin;

analyze public.event;
analyze public.place;
analyze public.ticket_type;
analyze public.event_occurrence;
analyze public.event_review;
analyze public.place_review;
analyze public.review;
analyze public.place_opening_hours;

create temp table perf_explore_timings (label text, ms double precision, n int) on commit drop;
grant all on perf_explore_timings to anon;

create temp table perf_explore_cases on commit drop as
select * from (values
  (10, 'events list   · Accra 10 km',
   'select count(*) from public.get_filtered_events(null, null, null, null, 5.65, 0.0, 10, '''', null, null, null)'),
  (11, 'events list   · Accra 50 km (whole city)',
   'select count(*) from public.get_filtered_events(null, null, null, null, 5.65, 0.0, 50, '''', null, null, null)'),
  (12, 'events list   · 50 km, one category',
   'select count(*) from public.get_filtered_events(null, null, null, null, 5.65, 0.0, 50, '''', ''Food & Drink'', null, null)'),
  (13, 'events list   · 50 km, price 10 to 60',
   'select count(*) from public.get_filtered_events(10, 60, null, null, 5.65, 0.0, 50, '''', null, null, null)'),
  (14, 'events list   · 50 km, next 7 days',
   'select count(*) from public.get_filtered_events(null, null, now(), now() + interval ''7 days'', 5.65, 0.0, 50, '''', null, null, null)'),
  (19, 'events list   · Accra 10 km, today',
   'select count(*) from public.get_filtered_events(null, null, date_trunc(''day'', now()), date_trunc(''day'', now()) + interval ''1 day'' - interval ''1 ms'', 5.65, 0.0, 10, '''', null, null, null)'),
  (15, 'events list   · 50 km, rated 4 and up',
   'select count(*) from public.get_filtered_events(null, null, null, null, 5.65, 0.0, 50, '''', null, null, 4)'),
  (16, 'events list   · Kumasi 10 km (small city)',
   'select count(*) from public.get_filtered_events(null, null, null, null, 6.69, -1.62, 10, '''', null, null, null)'),
  (17, 'events list   · no area (whole catalogue)',
   'select count(*) from public.get_filtered_events(null, null, null, null, null, null, null, '''', null, null, null)'),
  (18, 'events list   · 10 km, a later page (cursor)',
   'select count(*) from public.get_filtered_events(null, null, null, null, 5.65, 0.0, 10, '''', null, null, null, now() + interval ''2 days'', 3.0, ''00000000-0000-0000-0000-000000000000'')'),
  (20, 'events nearby · Accra 10 km',
   'select count(*) from public.get_nearby_events(5.65, 0.0, 10000, null, null, 20)'),
  (21, 'events nearby · Accra 50 km',
   'select count(*) from public.get_nearby_events(5.65, 0.0, 50000, null, null, 20)'),
  (22, 'events nearby · Accra 10 km, 60 rows',
   'select count(*) from public.get_nearby_events(5.65, 0.0, 10000, null, null, 60)'),
  (23, 'events nearby · Kumasi 10 km',
   'select count(*) from public.get_nearby_events(6.69, -1.62, 10000, null, null, 20)'),
  (30, 'places list   · Accra 20 km',
   'select count(*) from public.get_filtered_places(null, null, null, null, 5.65, 0.0, 20)'),
  (31, 'places list   · 20 km, open now',
   'select count(*) from public.get_filtered_places(null, null, null, true, 5.65, 0.0, 20, null, null, 10)'),
  (37, 'places list   · 20 km, open now, none open',
   'select count(*) from public.get_filtered_places(null, 14::smallint, null, true, 5.65, 0.0, 20, null, null, 10)'),
  (32, 'places list   · 20 km, rated 4 and up',
   'select count(*) from public.get_filtered_places(null, null, 4, null, 5.65, 0.0, 20)'),
  (33, 'places list   · 20 km, one category',
   'select count(*) from public.get_filtered_places(null, 3::smallint, null, null, 5.65, 0.0, 20)'),
  (34, 'places nearby · Accra 5 km',
   'select count(*) from public.get_nearby_places(5.65, 0.0, 5000, null, null, 20)'),
  (35, 'places nearby · Accra 50 km',
   'select count(*) from public.get_nearby_places(5.65, 0.0, 50000, null, null, 20)'),
  (36, 'places list   · Kumasi 20 km',
   'select count(*) from public.get_filtered_places(null, null, null, null, 6.69, -1.62, 20)'),
  (40, 'similar events · one category, 10 km',
   'select count(*) from (select * from public.get_similar_events(''Food & Drink'', extensions.st_setsrid(extensions.st_makepoint(0.0, 5.65), 4326)::extensions.geography, 10) order by starts_at limit 20) s'),
  (50, 'events in window · today, Accra 10 km',
   'select count(*) from public.get_events_in_window(5.65, 0.0, 10, date_trunc(''day'', now()), date_trunc(''day'', now()) + interval ''1 day'')'),
  (51, 'events in window · this month, Accra 10 km',
   'select count(*) from public.get_events_in_window(5.65, 0.0, 10, now(), now() + interval ''30 days'')'),
  (52, 'events in window · this week, Accra 10 km',
   'select count(*) from public.get_events_in_window(5.65, 0.0, 10, now(), now() + interval ''7 days'')'),
  (53, 'events in window · a week, whole country',
   'select count(*) from public.get_events_in_window(7.95, -1.03, 450, now(), now() + interval ''7 days'', null, null, 12)'),
  (60, 'explore rows  · Accra 10 km, all six',
   'select count(*) from public.get_explore_event_sections(5.65, 0.0, 10, 5, date_trunc(''day'', now()) + interval ''1 day'' - interval ''1 ms'', date_trunc(''month'', now()) + interval ''1 month'')'),
  (61, 'explore rows  · Accra 10 km, one category',
   'select count(*) from public.get_explore_event_sections(5.65, 0.0, 10, 5, date_trunc(''day'', now()) + interval ''1 day'' - interval ''1 ms'', date_trunc(''month'', now()) + interval ''1 month'', ''Food & Drink'')'),
  (62, 'explore rows  · Kumasi 10 km, all six',
   'select count(*) from public.get_explore_event_sections(6.69, -1.62, 10, 5, date_trunc(''day'', now()) + interval ''1 day'' - interval ''1 ms'', date_trunc(''month'', now()) + interval ''1 month'')'),
  (63, 'explore rows  · Accra 10 km, top rated only, 60',
   'select count(*) from public.get_explore_event_sections(5.65, 0.0, 10, 5, p_section_size => 60, p_sections => array[''topRatedOrganizers''])')
) as t(ord, name, sql);
grant select on perf_explore_cases to anon;

set role anon;
do $$
declare
  c record; i int; t0 timestamptz; n int;
begin
  for c in select * from perf_explore_cases order by ord loop
    begin
      execute c.sql into n;
      execute c.sql into n;
      for i in 1..12 loop
        t0 := clock_timestamp();
        execute c.sql into n;
        insert into perf_explore_timings values (c.name, extract(epoch from clock_timestamp() - t0) * 1000, n);
      end loop;
    exception when undefined_function then
      -- A function this database does not have yet (timing an older
      -- schema): the case is reported with no numbers.
      insert into perf_explore_timings values (c.name, null, null);
    end;
  end loop;
end $$;
reset role;

select c.name as "case",
       max(t.n) as rows,
       round(percentile_cont(0.5) within group (order by t.ms)::numeric, 1) as p50_ms,
       round(percentile_cont(0.95) within group (order by t.ms)::numeric, 1) as p95_ms
from perf_explore_cases c
left join perf_explore_timings t on t.label = c.name
group by c.name, c.ord
order by c.ord;

rollback;
