-- Phase 2 follow-up (DATA-003, DATA-004): stop 5 declared-partitioned
-- tables from silently rejecting every insert, and stop `review`'s
-- partition coverage from becoming a fixed-date time bomb.
--
-- Confirmed via a repo-wide grep before this migration: event_media,
-- event_share, wallet, story, and media_audit are not referenced by any
-- current application code (web, mobile, or admin) — this is a database-
-- level safety fix for unbuilt/unused features, not a behavior change to
-- anything live. Whether these tables should eventually be built out,
-- kept empty as a foundation, or dropped is an application/product
-- decision this migration deliberately does not make — flagging that
-- explicitly rather than dropping tables unprompted.

-- event_media, wallet are HASH-partitioned — Postgres does not support a
-- DEFAULT partition for hash partitioning (every hash bucket must be
-- pre-declared), so they need real modulus/remainder partitions. Same
-- 4-way convention already used for favorite_p1..p4 / payment_method_p0..p3.
create table if not exists public.event_media_p0 partition of public.event_media
  for values with (modulus 4, remainder 0);
create table if not exists public.event_media_p1 partition of public.event_media
  for values with (modulus 4, remainder 1);
create table if not exists public.event_media_p2 partition of public.event_media
  for values with (modulus 4, remainder 2);
create table if not exists public.event_media_p3 partition of public.event_media
  for values with (modulus 4, remainder 3);

create table if not exists public.wallet_p0 partition of public.wallet
  for values with (modulus 4, remainder 0);
create table if not exists public.wallet_p1 partition of public.wallet
  for values with (modulus 4, remainder 1);
create table if not exists public.wallet_p2 partition of public.wallet
  for values with (modulus 4, remainder 2);
create table if not exists public.wallet_p3 partition of public.wallet
  for values with (modulus 4, remainder 3);

-- event_share, story, media_audit are RANGE-partitioned on a timestamp with
-- no partitions at all. A single default partition is the minimal fix:
-- inserts stop failing, and real time-based partitions can be added later
-- (splitting rows out of the default) if/when these features are built.
create table if not exists public.event_share_default
  partition of public.event_share default;
create table if not exists public.story_default
  partition of public.story default;
create table if not exists public.media_audit_default
  partition of public.media_audit default;

-- DATA-004: review already has a review_default catch-all, so inserts past
-- the last named monthly partition (currently december_2026) do NOT fail —
-- they just stop benefiting from partition pruning and pile into one
-- unbounded default partition. This job keeps 3 months of real partitions
-- ahead of the current date so that never actually happens in practice.
create or replace function public.ensure_future_review_partitions()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_partition_name text;
  i integer;
begin
  for i in 0..2 loop
    v_month_start := date_trunc('month', now() + (i || ' months')::interval);
    v_month_end := v_month_start + interval '1 month';
    v_partition_name := 'review_'
      || lower(trim(to_char(v_month_start, 'Month')))
      || '_' || to_char(v_month_start, 'YYYY');

    if not exists (
      select 1
      from pg_inherits
      join pg_class c on c.oid = pg_inherits.inhrelid
      where pg_inherits.inhparent = 'public.review'::regclass
        and c.relname = v_partition_name
    ) then
      execute format(
        'create table public.%I partition of public.review for values from (%L) to (%L)',
        v_partition_name, v_month_start, v_month_end
      );
    end if;
  end loop;
end;
$$;

revoke execute on function public.ensure_future_review_partitions()
  from public, anon, authenticated;
grant execute on function public.ensure_future_review_partitions() to service_role;

-- Run once now (a no-op today — september/october/november 2026 already
-- exist) and keep it running monthly so this never becomes due again.
select public.ensure_future_review_partitions();

select cron.schedule(
  'ensure-future-review-partitions',
  '0 3 1 * *',
  $$select public.ensure_future_review_partitions();$$
);
