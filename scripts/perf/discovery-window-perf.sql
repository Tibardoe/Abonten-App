-- Discovery performance harness, part 2: the date-window feed
-- ("Happening today / this week / this month", get_events_in_window).
-- Runs after discovery-perf-seed.sql in the same psql session and ROLLS BACK.
-- See scripts/perf/README.md.
--
-- Times the function as installed: 20 runs per case after two warm-ups, for
-- three windows at 10 km (the web default) and 50 km (the whole seeded
-- city), first page and a deep page. To compare a new body, pipe its
-- migration between the seed and this script.

create temp table perf_window_timings (label text, ms double precision, n int) on commit drop;

create or replace function pg_temp.time_window(p_label text, p_radius double precision, p_start timestamptz, p_end timestamptz, p_deep boolean)
returns void language plpgsql as $$
declare
  t0 timestamptz;
  n int;
  c_start timestamptz;
  c_id uuid;
begin
  if p_deep then
    -- The cursor after 200 rows: what a person scrolling ten pages sends.
    select w.starts_at, w.id into c_start, c_id
    from public.get_events_in_window(5.65, -0.0, p_radius, p_start, p_end, null, null, 200) w
    order by w.starts_at desc, w.id desc limit 1;
  end if;
  for i in 1..22 loop
    t0 := clock_timestamp();
    select count(*) into n
    from public.get_events_in_window(5.65, -0.0, p_radius, p_start, p_end, c_start, c_id, 20);
    if i > 2 then
      insert into perf_window_timings values (p_label, extract(epoch from clock_timestamp() - t0) * 1000, n);
    end if;
  end loop;
end $$;

select pg_temp.time_window('1 today   · 10 km', 10, date_trunc('day', now()), date_trunc('day', now()) + interval '1 day' - interval '1 ms', false);
select pg_temp.time_window('2 week    · 10 km', 10, now(), now() + interval '7 days', false);
select pg_temp.time_window('3 month   · 10 km', 10, now(), now() + interval '30 days', false);
select pg_temp.time_window('4 month   · 50 km', 50, now(), now() + interval '30 days', false);
select pg_temp.time_window('5 month   · 50 km, page 11', 50, now(), now() + interval '30 days', true);

select label,
       round(percentile_cont(0.5) within group (order by ms)::numeric, 1) as p50_ms,
       round(percentile_cont(0.95) within group (order by ms)::numeric, 1) as p95_ms,
       max(n) as rows
from perf_window_timings
group by label
order by label;

rollback;
