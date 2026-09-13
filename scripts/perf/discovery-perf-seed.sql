-- Discovery performance harness, part 1: a synthetic catalogue.
-- LOCAL TEST STACK ONLY. See scripts/perf/README.md for how to run it.
--
-- Opens a transaction and never commits: the part-2 scripts end with
-- ROLLBACK, so nothing is left behind. Refuses to run on a database that
-- holds real data.
--
-- Shape: 50,000 accounts (2,000 of them organizers), 100,000 events,
-- 20,000 places, ~60,000 attendance rows. Titles mix three vocabulary bands so timings can be read
-- per band instead of from one unrealistic "every word is common" corpus:
--   common  50 real words      each in ~6% of events   (worst case)
--   mid     500 pseudo-words   each in ~0.2% of events
--   rare    20,000 pseudo-words each in ~5 events

\set ON_ERROR_STOP 1
\pset pager off
begin;

do $$
begin
  if (select count(*) from public.event) > 5000
     or (select count(*) from auth.users) > 5000 then
    raise exception 'discovery perf harness: refusing to run on a database with real data';
  end if;
end $$;

create temp table perf_common(n int primary key, w text) on commit drop;
insert into perf_common
select row_number() over () - 1, w from unnest(array[
  'accra','kumasi','takoradi','tamale','osu','labadi','east','legon','spintex','cantonments',
  'jazz','afrobeats','highlife','gospel','comedy','festival','night','party','brunch','live',
  'concert','summit','workshop','market','art','fashion','food','wine','yoga','run',
  'tech','startup','film','poetry','karaoke','dance','carnival','expo','fair','sunday',
  'kente','harmattan','chale','vibes','rooftop','beach','garden','lounge','hub','sounds']) w;

-- Letters-only pseudo-words, deterministic so queries can name them.
create temp table perf_mid(n int primary key, w text) on commit drop;
insert into perf_mid
select g, translate(substr(md5('mid' || g), 1, 8), '0123456789', 'ghijklmnop')
from generate_series(0, 499) g;

create temp table perf_rare(n int primary key, w text) on commit drop;
insert into perf_rare
select g, translate(substr(md5('rare' || g), 1, 9), '0123456789', 'ghijklmnop')
from generate_series(0, 19999) g;

insert into auth.users (id, email, instance_id, aud, role)
select gen_random_uuid(), 'perf-org-' || g || '@example.test',
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
from generate_series(1, 2000) g;

-- Everyone else: people who never post, so organizer search has to skip them.
insert into auth.users (id, email, instance_id, aud, role)
select gen_random_uuid(), 'perf-user-' || g || '@example.test',
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
from generate_series(1, 48000) g;

create temp table perf_people on commit drop as
select u.id, (row_number() over (order by u.email))::int as n
from auth.users u where u.email like 'perf-user-%@example.test';
create index on perf_people(n);

update public.user_info ui
set full_name = initcap(c.w) || ' ' || initcap(m.w)
from perf_people pp
join perf_common c on c.n = (pp.n * 3) % 50
join perf_mid m    on m.n = (pp.n * 7) % 500
where ui.id = pp.id;

create temp table perf_orgs on commit drop as
select u.id, (row_number() over (order by u.email))::int as n
from auth.users u where u.email like 'perf-org-%@example.test';
create index on perf_orgs(n);

update public.user_info ui
set username  = 'perf_' || c.w || '_' || m.w || '_' || o.n,
    full_name = initcap(c2.w) || ' ' || initcap(m.w) || ' Events',
    bio       = 'We organise ' || c2.w || ' experiences.'
from perf_orgs o
join perf_common c  on c.n  = (o.n * 7) % 50
join perf_common c2 on c2.n = (o.n * 19) % 50
join perf_mid m     on m.n  = (o.n * 13) % 500
where ui.id = o.id;

insert into public.event (
  organizer_id, event_category, event_type, title, slug, description, location, address,
  flyer_public_id, flyer_version, starts_at, ends_at, status, event_code, capacity, published_at
)
select
  o.id,
  (array['Music & Concerts','Arts, Culture & Theatre','Entertainment & Shows','Food & Drink','Sports & Fitness'])[1 + (g % 5)],
  '["Live Concerts"]',
  initcap(c1.w) || ' ' || initcap(m.w) || ' ' || initcap(r.w),
  'perf-event-' || g,
  'A ' || c2.w || ' ' || m.w || ' event in ' || c1.w || ' with music, food and friends. Come early.',
  extensions.st_setsrid(extensions.st_makepoint(-0.20 + random() * 0.4, 5.50 + random() * 0.3), 4326)::extensions.geography,
  jsonb_build_object('full_address', initcap(c2.w) || ', Accra, Ghana'),
  'perf/flyer', '1',
  now() + ((g % 120) - 10) * interval '1 day',
  now() + ((g % 120) - 10) * interval '1 day' + interval '4 hours',
  'published',
  'P' || lpad(g::text, 7, '0'),
  200,
  now() - interval '30 days'
from generate_series(1, 100000) g
join perf_orgs o    on o.n  = 1 + (g % 2000)
join perf_common c1 on c1.n = (g * 7) % 50
join perf_common c2 on c2.n = (g * 13) % 50
join perf_mid m     on m.n  = (g * 31) % 500
join perf_rare r    on r.n  = g % 20000;

insert into public.place (owner_id, name, slug, description, category_id, location, address, cover_public_id, cover_version, status, published_at)
select
  o.id,
  initcap(c.w) || ' ' || initcap(m.w) || ' ' || (array['Lounge','Grill','Gym','Cinema','Hotel'])[1 + (g % 5)],
  'perf-place-' || g,
  'A ' || c.w || ' spot in ' || initcap(r.w) || '.',
  1 + (g % 14),
  extensions.st_setsrid(extensions.st_makepoint(-0.20 + random() * 0.4, 5.50 + random() * 0.3), 4326)::extensions.geography,
  jsonb_build_object('full_address', initcap(r.w) || ', Accra, Ghana'),
  'perf/cover', '1', 'published', now() - interval '30 days'
from generate_series(1, 20000) g
join perf_orgs o   on o.n = 1 + (g % 2000)
join perf_common c on c.n = (g * 11) % 50
join perf_mid m    on m.n = (g * 17) % 500
join perf_rare r   on r.n = (g * 3) % 20000;

insert into public.attendance (user_id, event_id, number_of_tickets, status)
select o.id, e.id, 1 + (random() * 3)::int, 'attending'
from (select id, (row_number() over ())::int as n
      from public.event where slug like 'perf-event-%' order by random() limit 60000) e
join perf_orgs o on o.n = 1 + (e.n % 2000);

analyze public.event;
analyze public.place;
analyze public.user_info;
analyze public.attendance;
analyze public.event_occurrence;

-- Query terms for part 2.
select (select w from perf_common where n = 11) as common_word,
       (select w from perf_mid where n = 42)    as mid_word,
       (select w from perf_rare where n = 4242) as rare_word
\gset

select
  (select count(*) from public.event where slug like 'perf-event-%') as events,
  (select count(*) from public.place where slug like 'perf-place-%') as places,
  (select count(*) from perf_orgs) as organizers,
  (select count(*) from public.user_info) as accounts,
  (select count(*) from public.attendance) as attendance_rows;
