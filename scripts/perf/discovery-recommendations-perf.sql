-- Discovery performance harness, part 3: recommendation engine.
-- Runs after discovery-perf-seed.sql in the same psql session and ROLLS BACK.
-- See scripts/perf/README.md.
--
-- 10,000 of the seeded people subscribe: each follows 3 organizers and asks
-- for similar events around Accra in 2 categories (50,000 subscriptions).
-- One organizer is followed by all 10,000. Then 50 events are published
-- (one by that organizer), the generator runs, and the daily digest is built
-- with shadow mode off so the full notification path is exercised.

\timing off

create temp table perf_subscribers on commit drop as
select id, n from perf_people where n <= 10000;

insert into public.notification_subscription (user_id, kind, target_id, source)
select s.id, 'organizer', o.id, 'profile'
from perf_subscribers s
cross join generate_series(0, 2) k
join perf_orgs o on o.n = 2 + ((s.n * 37 + k * 101) % 1999)
on conflict do nothing;

insert into public.notification_subscription (user_id, kind, target_id, source)
select s.id, 'organizer', (select id from perf_orgs where n = 1), 'profile'
from perf_subscribers s
on conflict do nothing;

insert into public.notification_subscription (
  user_id, kind, topic_category, topic_location, topic_radius_km, source
)
select s.id, 'similar_events',
       (array['Music & Concerts','Arts, Culture & Theatre','Entertainment & Shows','Food & Drink','Sports & Fitness'])[1 + ((s.n + k) % 5)],
       extensions.st_setsrid(extensions.st_makepoint(-0.25 + ((s.n * 13) % 100) / 200.0, 5.45 + ((s.n * 7) % 100) / 250.0), 4326)::extensions.geography,
       25, 'purchase_prompt'
from perf_subscribers s
cross join generate_series(0, 1) k
on conflict do nothing;

analyze public.notification_subscription;

select kind, count(*) from public.notification_subscription group by kind order by kind;

-- A platform with 10,000 subscribers already has notification history; an
-- almost empty notification table would make every foreign-key check a
-- sequential scan and misreport the digest cost.
insert into public.notification (user_id, type, title, body, created_at, read_at)
select p.id, 'message', 'New message', 'Synthetic history',
       now() - (g % 60) * interval '1 day', now() - (g % 60) * interval '1 day'
from perf_people p
cross join generate_series(1, 4) g;
analyze public.notification;

-- Programme on for everyone, shadow off, watermark before the new events.
update public.discovery_program_setting
set recommendations_enabled = true,
    recommendations_shadow_mode = false,
    recommendations_audience = 'all',
    generate_watermark = now() - interval '1 day'
where id = 1;

insert into public.event (
  organizer_id, event_category, event_type, title, slug, description, location, address,
  flyer_public_id, flyer_version, starts_at, ends_at, status, event_code, capacity, published_at
)
select
  case when g = 1 then (select id from perf_orgs where n = 1)
       else (select id from perf_orgs where n = 1 + (g * 41) % 2000) end,
  (array['Music & Concerts','Arts, Culture & Theatre','Entertainment & Shows','Food & Drink','Sports & Fitness'])[1 + (g % 5)],
  '["Live Concerts"]',
  'Fresh Perf Event ' || g,
  'perf-fresh-' || g,
  'A newly published synthetic event.',
  extensions.st_setsrid(extensions.st_makepoint(-0.20 + (g % 10) / 40.0, 5.55 + (g % 7) / 50.0), 4326)::extensions.geography,
  jsonb_build_object('full_address', 'Osu, Accra, Ghana'),
  'perf/flyer', '1',
  now() + (3 + g % 20) * interval '1 day',
  now() + (3 + g % 20) * interval '1 day' + interval '4 hours',
  'published',
  'F' || lpad(g::text, 7, '0'),
  200,
  now() - interval '10 minutes'
from generate_series(1, 50) g;

analyze public.event;

\timing on
select public.recommendations_generate(200) as generate_result;
\timing off

select status, reason_kind, count(*)
from public.recommendation
group by status, reason_kind
order by status, reason_kind;

select count(*) as candidates_for_mega_organizer_event
from public.recommendation r
join public.event e on e.id = r.subject_id
where e.slug = 'perf-fresh-1' and r.reason_kind = 'organizer';

-- Second run with nothing new: must be cheap and insert nothing.
\timing on
select public.recommendations_generate(200) as idle_generate_result;

select public.recommendations_build_digest(50000, true) as digest_result;
\timing off

select count(*) as digests,
       max(item_count) as max_items,
       count(*) filter (where notification_id is not null) as with_notification
from public.recommendation_digest;

select count(*) as queued_pushes
from public.notification_delivery
where source = 'recommendations';

-- Re-running the digest the same day must not add a second one per person.
\timing on
select public.recommendations_build_digest(50000, true) as second_digest_result;
\timing off

select user_id, count(*) from public.recommendation_digest
group by user_id having count(*) > 1 limit 5;

\timing on
select public.admin_recommendation_metrics(14) is not null as metrics_ok;
\timing off

rollback;
