-- Discovery performance harness, part 2: search timings and plans.
-- Runs after discovery-perf-seed.sql in the same psql session and ROLLS BACK.
-- See scripts/perf/README.md.

-- ---------------------------------------------------------------------
-- Timings as the anon role (what the apps use): 40 runs each after two
-- warm-up runs; p50 / p95 / max in milliseconds, plus the row count.
-- ---------------------------------------------------------------------
create temp table perf_timings (fn text, ms double precision, n int) on commit drop;
grant all on perf_timings to anon;

create temp table perf_cases on commit drop as
select * from (
  select 1 as ord, 'suggest    · 2 chars, common prefix'::text as name,
         format('select count(*) from public.search_suggest(%L)', 'ja') as sql
  union all select 2, 'suggest    · common word',
         format('select count(*) from public.search_suggest(%L)', (select w from perf_common where n = 11))
  union all select 3, 'suggest    · mid word',
         format('select count(*) from public.search_suggest(%L)', (select w from perf_mid where n = 42))
  union all select 4, 'suggest    · mid prefix (4 chars)',
         format('select count(*) from public.search_suggest(%L)', left((select w from perf_mid where n = 42), 4))
  union all select 5, 'suggest    · rare word',
         format('select count(*) from public.search_suggest(%L)', (select w from perf_rare where n = 4242))
  union all select 6, 'suggest    · rare typo (trigram fallback)',
         format('select count(*) from public.search_suggest(%L)',
                left((select w from perf_rare where n = 4242), 8) || 'x')
  union all select 7, 'suggest    · common typo (trigram fallback)',
         format('select count(*) from public.search_suggest(%L)', 'afrobeets')
  union all select 8, 'suggest    · common + mid word, with location',
         format('select count(*) from public.search_suggest(%L, 5.6, -0.19)',
                'jazz ' || (select w from perf_mid where n = 42))
  union all select 9, 'suggest    · @handle prefix',
         format('select count(*) from public.search_suggest(%L)', '@perf_jazz')
  union all select 20, 'events     · common word, with location',
         format('select count(*) from public.search_events(%L, 5.6, -0.19)', 'jazz')
  union all select 21, 'events     · mid word, with location',
         format('select count(*) from public.search_events(%L, 5.6, -0.19)', (select w from perf_mid where n = 42))
  union all select 22, 'events     · rare word',
         format('select count(*) from public.search_events(%L)', (select w from perf_rare where n = 4242))
  union all select 23, 'events     · common word + price + date filters',
         format('select count(*) from public.search_events(%L, p_min_price => 10, p_max_price => 100, p_start_date => now(), p_end_date => now() + interval %L)', 'night', '30 days')
  union all select 24, 'events     · one organizer''s events (browse)',
         format('select count(*) from public.search_events(%L, p_organizer_id => %L)', '', (select id from perf_orgs where n = 7))
  union all select 30, 'places     · common word, with location',
         format('select count(*) from public.search_places(%L, 5.6, -0.19)', 'rooftop')
  union all select 31, 'places     · mid word',
         format('select count(*) from public.search_places(%L)', (select w from perf_mid where n = 42))
  union all select 32, 'places     · category name',
         format('select count(*) from public.search_places(%L, 5.6, -0.19)', 'restaurant')
  union all select 40, 'organizers · mid word',
         format('select count(*) from public.search_organizers(%L)', (select w from perf_mid where n = 91))
  union all select 41, 'organizers · @handle prefix',
         format('select count(*) from public.search_organizers(%L)', '@perf_jazz')
) c;
grant select on perf_cases to anon;

set role anon;

do $$
declare
  c  record;
  i  int;
  t0 timestamptz;
  n  int;
begin
  for c in select * from perf_cases order by ord loop
    execute c.sql into n;
    execute c.sql into n;
    for i in 1..40 loop
      t0 := clock_timestamp();
      execute c.sql into n;
      insert into perf_timings values (c.name, extract(epoch from clock_timestamp() - t0) * 1000, n);
    end loop;
  end loop;
end $$;

reset role;

select t.fn as "case",
       max(t.n) as rows,
       round(percentile_cont(0.5) within group (order by t.ms)::numeric, 1) as p50_ms,
       round(percentile_cont(0.95) within group (order by t.ms)::numeric, 1) as p95_ms,
       round(max(t.ms)::numeric, 1) as max_ms
from perf_timings t
join perf_cases c on c.name = t.fn
group by t.fn, c.ord
order by c.ord;

-- ---------------------------------------------------------------------
-- Plans for stage-1 candidate queries: they must use the partial GIN,
-- trigram and prefix indexes, not scan the table.
-- ---------------------------------------------------------------------
select public._search_trgm_thresholds();

explain (analyze, costs off, timing off, summary on)
select e.id
from public.event e
where e.status = 'published'
  and e.archived_at is null
  and e.moderation_state is distinct from 'hidden'
  and e.moderation_state is distinct from 'removed'
  and e.search_tsv @@ public._search_prefix_tsquery((select w from perf_mid where n = 42));

explain (analyze, costs off, timing off, summary on)
select e.id
from public.event e
where e.status = 'published'
  and e.archived_at is null
  and e.moderation_state is distinct from 'hidden'
  and e.moderation_state is distinct from 'removed'
  and (left((select w from perf_rare where n = 4242), 8) || 'x') operator(extensions.<%) e.title;

explain (analyze, costs off, timing off, summary on)
select p.id
from public.place p
where p.status = 'published'
  and p.moderation_state is distinct from 'hidden'
  and p.moderation_state is distinct from 'removed'
  and p.search_tsv @@ public._search_prefix_tsquery((select w from perf_mid where n = 42));

explain (analyze, costs off, timing off, summary on)
select u.id
from public.user_info u
where u.status_id = 1
  and lower(u.username::text) like 'perf\_jazz%' escape '\';

rollback;
