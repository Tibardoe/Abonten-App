-- Brings every database to production's state for two things the
-- migration history cannot replay. Production already looks like this;
-- here it changes nothing.
--
-- 1. user_info had two identical unique indexes on `id`: the primary key
--    and `user_info_id_key`, a unique constraint from before the key
--    existed. 20260825105907 dropped the constraint, which worked on
--    production only because it was already gone there. On a database
--    built from the migrations (preview, CI, local) about 150 foreign keys
--    are attached to `user_info_id_key`, so the drop fails and every write
--    to user_info maintains both indexes. Each of those foreign keys is
--    dropped and added again, now on the primary key, and the duplicate is
--    dropped. The keys are re-added exactly as they were
--    (pg_get_constraintdef: same columns, actions and deferral).
--
-- 2. place_drafts_owner_all asked auth.uid() for every row (20260827090000
--    created it that way, after 20260825105907 had already rewritten it on
--    production). `(select auth.uid())` is asked once per statement.

do $$
declare
  r record;
  v_count integer := 0;
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_info'::regclass and conname = 'user_info_id_key'
  ) then
    return;
  end if;

  create temp table _user_info_fk on commit drop as
  select c.conrelid::regclass as tbl, c.conname, pg_get_constraintdef(c.oid) as def
  from pg_constraint c
  join pg_class i on i.oid = c.conindid
  where c.contype = 'f'
    and i.relname = 'user_info_id_key'
    -- A key inherited by a partition goes and comes back with its parent's.
    and c.conparentid = 0;

  for r in select * from _user_info_fk loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    v_count := v_count + 1;
  end loop;

  alter table public.user_info drop constraint user_info_id_key;

  for r in select * from _user_info_fk loop
    execute format('alter table %s add constraint %I %s', r.tbl, r.conname, r.def);
  end loop;

  raise notice 'user_info_id_key dropped; % foreign key(s) now use user_info_pkey', v_count;
end
$$;

alter policy place_drafts_owner_all on public.place_drafts
  using (exists (select 1 from public.drafts d
                 where d.id = place_drafts.draft_id and d.user_id = (select auth.uid())))
  with check (exists (select 1 from public.drafts d
                      where d.id = place_drafts.draft_id and d.user_id = (select auth.uid())));

-- Checks
do $$
begin
  if exists (select 1 from pg_constraint
             where conrelid = 'public.user_info'::regclass and conname = 'user_info_id_key') then
    raise exception 'migration check: user_info_id_key is still there';
  end if;
  if exists (
    select 1 from pg_constraint c
    where c.contype = 'f' and c.confrelid = 'public.user_info'::regclass
      and c.conindid <> 'public.user_info_pkey'::regclass
  ) then
    raise exception 'migration check: a foreign key to user_info is not on its primary key';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'place_drafts' and policyname = 'place_drafts_owner_all'
      and (qual not ilike '%select auth.uid()%' or with_check not ilike '%select auth.uid()%')
  ) then
    raise exception 'migration check: place_drafts_owner_all still asks auth.uid() per row';
  end if;
end
$$;
