-- Every monthly partition of public.review has row security switched on,
-- like the partitions made by hand (2026-08-25). The monthly job
-- ensure_future_review_partitions() created review_january_2027 on
-- 2026-11-01 without it, and the security advisor flagged the table
-- (rls_disabled_in_public, ERROR) on Preview and Production.
--
-- Reads and writes through public.review are unchanged: Postgres applies
-- the parent's access rules to rows reached through the parent. Row
-- security on a partition only closes direct access to that partition,
-- which the Data API does not offer today (it leaves partitions out of
-- its schema), so this is defence in depth, not an incident.

-- 1. Every existing partition of review (and any partition of those).
do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass as rel
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    where i.inhparent = 'public.review'::regclass
      and not c.relrowsecurity
  loop
    execute format('alter table %s enable row level security', r.rel);
  end loop;
end;
$$;

-- 2. The monthly job switches it on for every partition it makes.
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
      -- Row security is per table and is not inherited from the parent.
      execute format(
        'alter table public.%I enable row level security',
        v_partition_name
      );
    end if;
  end loop;
end;
$$;

revoke execute on function public.ensure_future_review_partitions()
  from public, anon, authenticated;
grant execute on function public.ensure_future_review_partitions() to service_role;

-- 3. Checks.
do $$
begin
  if exists (
    select 1
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    where i.inhparent = 'public.review'::regclass
      and not c.relrowsecurity
  ) then
    raise exception 'migration check: a review partition is still without row security';
  end if;
end;
$$;
