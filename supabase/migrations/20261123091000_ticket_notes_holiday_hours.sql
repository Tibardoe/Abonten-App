-- Ticket notes and holiday hours (2026-11-23, founder's decision of 23 Nov
-- 2026, for venues such as an amusement park; PROJECT.md §90).
--
-- A. What a ticket type includes
--
--   * `ticket_type.description`: an optional one-line note under the
--     ticket's name ("Kids: ages 3–12", "Entry + 50 ride credits"). Plain
--     text, at most 140 characters, no links. @abonten/core/ticketTypeNote
--     is the rule (it trims and folds spaces before saving); the CHECK below
--     is the database's backstop for a row written past the service. Change
--     the two together.
--   * The note changes no money, so it stays editable after the first sale:
--     the services' full ticket editor locks after a sale, and a separate
--     notes-only path (updateTicketTypeNotesCore) writes this column alone.
--     No guard trigger limits it: the ticket_type triggers fire only on the
--     money and stock columns (price, currency, quantity, admits, type,
--     section), and the organizer's existing update rule covers the rest.
--   * create_event writes it from the ticket types it is given, and
--     event_add_show (a run's new show, or a copy) copies it. Both are
--     changed in place at a named anchor, so a change another branch makes
--     elsewhere in those functions is kept; a missing anchor stops the
--     migration. Moving an event to a team and joining runs move events,
--     not ticket types, so the note goes with them as it is.
--
-- B. Special dates in a place's opening hours
--
--   * `place_special_hours`: one row per place and date (the place's own
--     calendar): closed all day, or open from one time to another (across
--     midnight when the closing time is not later, as the weekly hours),
--     with an optional name ("Christmas Day"). It replaces that date's
--     weekday hours, and only that date's: yesterday's hours that run past
--     midnight still count after midnight, whichever kind they are.
--   * Protected like place_opening_hours: everyone reads the rows of a
--     published place, the place's owner (a person or a team acting with
--     places.manage, through acting_accounts) writes them, and a
--     restricted account cannot (guard_restricted_account).
--   * "Open now" has four copies, kept in step: place_is_open_now (cards,
--     search, promotions, Abonten Weekly), _place_open_now (the reader's
--     "open now" filter on the Explore rows) and the body written out in
--     get_filtered_places and in the "Open now" Explore row (one index
--     lookup a place, never a function call a place). Each now reads the
--     special dates of today and yesterday first. The TypeScript mirror is
--     @abonten/core/computePlaceOpenStatus; explore-lists.integration.test.ts
--     checks all five agree. The two long functions are changed at an
--     anchor, each checked against the definition this was written against.
--   * Past dates are never read (every read asks for today, yesterday or
--     the next days); the service removes a place's past rows when its
--     owner adds a date, so no job is needed.

begin;

-- ---------------------------------------------------------------------------
-- Fingerprints (line endings ignored): the "open now" functions changed
-- below must be the ones this migration was written against.

do $fp$
declare
  r record;
begin
  for r in
    select * from (values
      ('place_is_open_now',          '17410bbec4b9fac3c49b8883269c4400'),
      ('_place_open_now',            '6ee5baae9de69078c434b31407cf033a'),
      ('get_filtered_places',        'fcef25f5d85745784c36bb51b4c4127c'),
      ('get_explore_place_sections', '87835f12443b00a8453a81b8fa8a7501')
    ) as f(name, fingerprint)
  loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = r.name
        and md5(replace(p.prosrc, chr(13), '')) = r.fingerprint
    ) then
      raise exception 'ticket_notes_holiday_hours: public.% is not the definition this migration expects', r.name;
    end if;
  end loop;
end;
$fp$;

-- ===========================================================================
-- A. ticket_type.description

alter table public.ticket_type
  add column description text;

alter table public.ticket_type
  add constraint ticket_type_description_check check (
    description is null
    or (char_length(description) between 1 and 140
        and description = btrim(description)
        and description !~ '[[:cntrl:]]'
        and description !~* '(://|www\.)')
  );

comment on column public.ticket_type.description is
  'What the ticket includes, shown under its name ("Kids: ages 3–12"). Plain text, one line, at most 140 characters, '
  'no links (@abonten/core/ticketTypeNote). Changes no money: editable after the first sale.';

do $tickets$
declare
  v_fn  regprocedure;
  v_def text;
  v_new text;
begin
  -- create_event: the note from each ticket type it is given.
  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_event';
  v_def := replace(pg_get_functiondef(v_fn), chr(13), '');
  v_new := replace(v_def,
$a$    insert into ticket_type (event_id, type, price, currency, quantity, available_from, available_until, admits)$a$,
$b$    insert into ticket_type (event_id, type, price, currency, quantity, available_from, available_until, admits, description)$b$);
  v_new := replace(v_new,
$a$      coalesce(nullif(elem->>'admits', '')::smallint, 1)
    from jsonb_array_elements(p_ticket_types) elem;$a$,
$b$      coalesce(nullif(elem->>'admits', '')::smallint, 1),
      -- What the ticket includes (@abonten/core/ticketTypeNote).
      nullif(btrim(elem->>'description'), '')
    from jsonb_array_elements(p_ticket_types) elem;$b$);
  if v_new not like '%admits, description)%'
     or v_new not like '%nullif(btrim(elem->>''description''), '''')%' then
    raise exception 'ticket_notes_holiday_hours: the ticket types of create_event were not found';
  end if;
  execute v_new;

  -- event_add_show: a run's new show (or a copy) keeps each note.
  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'event_add_show';
  v_def := replace(pg_get_functiondef(v_fn), chr(13), '');
  v_new := replace(v_def,
$a$    event_id, type, price, currency, quantity, admits, available_from, available_until, pass_shows,
    seating_section_id
  )$a$,
$b$    event_id, type, price, currency, quantity, admits, available_from, available_until, pass_shows,
    seating_section_id, description
  )$b$);
  v_new := replace(v_new,
$a$    case when v_moved then null else tt.seating_section_id end
  from public.ticket_type tt$a$,
$b$    case when v_moved then null else tt.seating_section_id end,
    tt.description
  from public.ticket_type tt$b$);
  if v_new not like '%seating_section_id, description%'
     or v_new not like '%tt.description%' then
    raise exception 'ticket_notes_holiday_hours: the ticket types of event_add_show were not found';
  end if;
  execute v_new;
end;
$tickets$;

-- ===========================================================================
-- B. place_special_hours

create table public.place_special_hours (
  id           uuid        not null default gen_random_uuid() primary key,
  place_id     uuid        not null references public.place(id) on delete cascade,
  -- A day of the place's own calendar (place.timezone).
  special_date date        not null,
  open_time    time,
  close_time   time,
  is_closed    boolean     not null default false,
  label        text,
  created_at   timestamptz not null default now(),
  constraint place_special_hours_place_date_key unique (place_id, special_date),
  -- As place_opening_hours: an open day has both times (a closing time not
  -- later than the opening time runs past midnight; equal is all day).
  constraint place_special_hours_range_check
    check (is_closed or (open_time is not null and close_time is not null)),
  -- @abonten/core/placeSpecialHours SPECIAL_HOURS_LABEL_MAX, plain text.
  constraint place_special_hours_label_check check (
    label is null
    or (char_length(label) between 1 and 60
        and label = btrim(label)
        and label !~ '[[:cntrl:]]'
        and label !~* '(://|www\.)')
  )
);

comment on table public.place_special_hours is
  'A place''s hours on one date of its own calendar (a holiday, a special event): closed, or open from one time to '
  'another, with an optional name. Replaces that date''s weekday hours in place_opening_hours for "open now" and on '
  'the place page. Owner-written (acting_accounts places.manage), public for published places (PROJECT.md §90).';

alter table public.place_special_hours enable row level security;

create policy place_special_hours_select on public.place_special_hours
  as permissive for select to public
  using ((exists (select 1
     from place p
    where ((p.id = place_special_hours.place_id) and (p.owner_id = any ((select public.acting_accounts(array['places.manage', 'bookings.manage', 'visit.show']))::uuid[])))))
   or (exists (select 1
     from place p
    where ((p.id = place_special_hours.place_id) and (p.status = 'published'::text)))));

create policy place_special_hours_owner_insert on public.place_special_hours
  as permissive for insert to public
  with check ((exists (select 1
     from place p
    where ((p.id = place_special_hours.place_id) and (p.owner_id = any ((select public.acting_accounts(array['places.manage']))::uuid[]))))));

create policy place_special_hours_owner_update on public.place_special_hours
  as permissive for update to public
  using ((exists (select 1
     from place p
    where ((p.id = place_special_hours.place_id) and (p.owner_id = any ((select public.acting_accounts(array['places.manage']))::uuid[]))))))
  with check ((exists (select 1
     from place p
    where ((p.id = place_special_hours.place_id) and (p.owner_id = any ((select public.acting_accounts(array['places.manage']))::uuid[]))))));

create policy place_special_hours_owner_delete on public.place_special_hours
  as permissive for delete to public
  using ((exists (select 1
     from place p
    where ((p.id = place_special_hours.place_id) and (p.owner_id = any ((select public.acting_accounts(array['places.manage']))::uuid[]))))));

revoke all on public.place_special_hours from public, anon, authenticated;
grant select on public.place_special_hours to anon;
grant select, insert, update, delete on public.place_special_hours to authenticated;
grant all on public.place_special_hours to service_role;

-- A restricted (banned) account writes nothing others see.
create trigger guard_restricted_account_trg
  before insert or update on public.place_special_hours
  for each row execute function public.guard_restricted_account();

-- ---------------------------------------------------------------------------
-- place_is_open_now: the one rule, for cards, search, promotions, Weekly.
--
-- It runs once a card (_place_cards), inside list functions that set
-- plan_cache_mode = force_custom_plan, which a function call inherits: its
-- query was planned again for every card. With the special dates that
-- planning cost about 0.15 ms a card (a 21-card list: 2.4 ms before, 5 ms
-- after, on the scripts/perf harness). Its statements are lookups by one
-- place id, whose generic plan is the right one, so it plans them once a
-- session: 1.2 ms for the same list.

create or replace function public.place_is_open_now(p_place_id uuid, p_now timestamp with time zone default now())
 returns boolean
 language plpgsql
 stable
 set search_path to 'public', 'extensions'
 set plan_cache_mode to 'auto'
as $function$
declare
  v_temporary_status text;
  v_zone text;
  v_local timestamp;
  v_today date;
  v_dow smallint;
  v_time time;
  v_is_open boolean;
begin
  select temporary_status, timezone into v_temporary_status, v_zone from place where id = p_place_id;
  if v_temporary_status is not null then
    return false;
  end if;

  v_local := p_now at time zone coalesce(nullif(v_zone, ''), 'UTC');
  v_today := v_local::date;
  v_dow := extract(dow from v_local);
  v_time := v_local::time;

  -- The hours of today and of yesterday (which may run past midnight): a
  -- special date's (place_special_hours) in place of its weekday's.
  select exists (
    select 1
    from (
      select s.special_date = v_today as is_today, s.open_time, s.close_time, s.is_closed
      from place_special_hours s
      where s.place_id = p_place_id
        and s.special_date in (v_today, v_today - 1)
      union all
      select h.day_of_week = v_dow, h.open_time, h.close_time, h.is_closed
      from place_opening_hours h
      where h.place_id = p_place_id
        and h.day_of_week in (v_dow, ((v_dow + 6) % 7)::smallint)
        and not exists (
          select 1 from place_special_hours s
          where s.place_id = p_place_id
            and s.special_date = case when h.day_of_week = v_dow then v_today else v_today - 1 end)
    ) d
    where not d.is_closed
      and case
            when d.is_today then
              (d.close_time > d.open_time and v_time between d.open_time and d.close_time)
              or (d.close_time <= d.open_time and v_time >= d.open_time)
            -- yesterday's hours that run past midnight
            else d.close_time <= d.open_time and v_time < d.close_time
          end
  ) into v_is_open;

  return coalesce(v_is_open, false);
end;
$function$;

-- ---------------------------------------------------------------------------
-- _place_open_now: the reader's "open now" filter on the Explore rows.

create or replace function public._place_open_now(
  p_place_id         uuid,
  p_timezone         text,
  p_temporary_status text
)
returns boolean
language sql
stable
as $function$
  select p_temporary_status is null
     and exists (
       select 1
       from (select now() at time zone coalesce(nullif(p_timezone, ''), 'UTC') as at_local) l
       -- Today's and yesterday's hours, a special date's in place of its
       -- weekday's (the rule of place_is_open_now).
       cross join lateral (
         select s.special_date = l.at_local::date as is_today,
                s.open_time, s.close_time, s.is_closed
         from public.place_special_hours s
         where s.place_id = p_place_id
           and s.special_date in (l.at_local::date, l.at_local::date - 1)
         union all
         select h.day_of_week = extract(dow from l.at_local)::smallint,
                h.open_time, h.close_time, h.is_closed
         from public.place_opening_hours h
         where h.place_id = p_place_id
           and h.day_of_week in (extract(dow from l.at_local)::smallint,
                                 ((extract(dow from l.at_local)::integer + 6) % 7)::smallint)
           and not exists (
             select 1 from public.place_special_hours s
             where s.place_id = p_place_id
               and s.special_date = case when h.day_of_week = extract(dow from l.at_local)::smallint
                                         then l.at_local::date else l.at_local::date - 1 end)
       ) d
       where not d.is_closed
         and case
               when d.is_today then
                 (d.close_time > d.open_time and l.at_local::time between d.open_time and d.close_time)
                 or (d.close_time <= d.open_time and l.at_local::time >= d.open_time)
               else d.close_time <= d.open_time and l.at_local::time < d.close_time
             end)
$function$;

revoke all on function public._place_open_now(uuid, text, text) from public, anon, authenticated;
grant execute on function public._place_open_now(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- The body written out in the two lists (one index lookup a place).

do $open$
declare
  v_fn  regprocedure;
  v_def text;
  v_new text;
begin
  -- "All places" (get_filtered_places).
  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_filtered_places';
  v_def := replace(pg_get_functiondef(v_fn), chr(13), '');
  v_new := replace(v_def,
$a$       or (n.temporary_status is null
           and exists (
             select 1
             from (select now() at time zone coalesce(nullif(n.timezone, ''), 'UTC') as at_local) l
             join place_opening_hours h
               on h.place_id = n.place_id
              and h.day_of_week in (extract(dow from l.at_local)::smallint,
                                    ((extract(dow from l.at_local)::integer + 6) % 7)::smallint)
             where not h.is_closed
               and case
                     when h.day_of_week = extract(dow from l.at_local)::smallint then
                       (h.close_time > h.open_time and l.at_local::time between h.open_time and h.close_time)
                       or (h.close_time <= h.open_time and l.at_local::time >= h.open_time)
                     -- Yesterday's hours that run past midnight.
                     else h.close_time <= h.open_time and l.at_local::time < h.close_time
                   end))$a$,
$b$       or (n.temporary_status is null
           and exists (
             select 1
             from (select now() at time zone coalesce(nullif(n.timezone, ''), 'UTC') as at_local) l
             -- Today's and yesterday's hours: a special date's (a holiday,
             -- place_special_hours) in place of its weekday's.
             cross join lateral (
               select s.special_date = l.at_local::date as is_today,
                      s.open_time, s.close_time, s.is_closed
               from place_special_hours s
               where s.place_id = n.place_id
                 and s.special_date in (l.at_local::date, l.at_local::date - 1)
               union all
               select h.day_of_week = extract(dow from l.at_local)::smallint,
                      h.open_time, h.close_time, h.is_closed
               from place_opening_hours h
               where h.place_id = n.place_id
                 and h.day_of_week in (extract(dow from l.at_local)::smallint,
                                       ((extract(dow from l.at_local)::integer + 6) % 7)::smallint)
                 and not exists (
                   select 1 from place_special_hours s
                   where s.place_id = n.place_id
                     and s.special_date = case when h.day_of_week = extract(dow from l.at_local)::smallint
                                               then l.at_local::date else l.at_local::date - 1 end)
             ) d
             where not d.is_closed
               and case
                     when d.is_today then
                       (d.close_time > d.open_time and l.at_local::time between d.open_time and d.close_time)
                       or (d.close_time <= d.open_time and l.at_local::time >= d.open_time)
                     -- Yesterday's hours that run past midnight.
                     else d.close_time <= d.open_time and l.at_local::time < d.close_time
                   end))$b$);
  if v_new = v_def then
    raise exception 'ticket_notes_holiday_hours: the "open now" check of get_filtered_places was not found';
  end if;
  execute v_new;

  -- The "Open now" Explore row (get_explore_place_sections).
  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_explore_place_sections';
  v_def := replace(pg_get_functiondef(v_fn), chr(13), '');
  v_new := replace(v_def,
$a$    where o.temporary_status is null
      and exists (
        select 1
        from (select now() at time zone coalesce(nullif(o.timezone, ''), 'UTC') as at_local) l
        join place_opening_hours h
          on h.place_id = o.place_id
         and h.day_of_week in (extract(dow from l.at_local)::smallint,
                               ((extract(dow from l.at_local)::integer + 6) % 7)::smallint)
        where not h.is_closed
          and case
                when h.day_of_week = extract(dow from l.at_local)::smallint then
                  (h.close_time > h.open_time and l.at_local::time between h.open_time and h.close_time)
                  or (h.close_time <= h.open_time and l.at_local::time >= h.open_time)
                else h.close_time <= h.open_time and l.at_local::time < h.close_time
              end)$a$,
$b$    where o.temporary_status is null
      and exists (
        select 1
        from (select now() at time zone coalesce(nullif(o.timezone, ''), 'UTC') as at_local) l
        -- Today's and yesterday's hours: a special date's (a holiday,
        -- place_special_hours) in place of its weekday's.
        cross join lateral (
          select s.special_date = l.at_local::date as is_today,
                 s.open_time, s.close_time, s.is_closed
          from place_special_hours s
          where s.place_id = o.place_id
            and s.special_date in (l.at_local::date, l.at_local::date - 1)
          union all
          select h.day_of_week = extract(dow from l.at_local)::smallint,
                 h.open_time, h.close_time, h.is_closed
          from place_opening_hours h
          where h.place_id = o.place_id
            and h.day_of_week in (extract(dow from l.at_local)::smallint,
                                  ((extract(dow from l.at_local)::integer + 6) % 7)::smallint)
            and not exists (
              select 1 from place_special_hours s
              where s.place_id = o.place_id
                and s.special_date = case when h.day_of_week = extract(dow from l.at_local)::smallint
                                          then l.at_local::date else l.at_local::date - 1 end)
        ) d
        where not d.is_closed
          and case
                when d.is_today then
                  (d.close_time > d.open_time and l.at_local::time between d.open_time and d.close_time)
                  or (d.close_time <= d.open_time and l.at_local::time >= d.open_time)
                else d.close_time <= d.open_time and l.at_local::time < d.close_time
              end)$b$);
  if v_new = v_def then
    raise exception 'ticket_notes_holiday_hours: the "Open now" row of get_explore_place_sections was not found';
  end if;
  execute v_new;
end;
$open$;

-- ---------------------------------------------------------------------------
-- Checks

do $$
declare
  v_fn text;
begin
  -- Every copy of "open now" reads the special dates.
  foreach v_fn in array array[
    'public.place_is_open_now(uuid, timestamp with time zone)',
    'public._place_open_now(uuid, text, text)',
    'public.get_filtered_places(text, smallint, numeric, boolean, double precision, double precision, double precision, double precision, uuid, integer)',
    'public.get_explore_place_sections(double precision, double precision, double precision, double precision, smallint, numeric, boolean, numeric, integer, integer, integer)'
  ] loop
    if to_regprocedure(v_fn) is null then
      raise exception 'migration check: % is missing', v_fn;
    end if;
    if (select p.prosrc from pg_proc p where p.oid = to_regprocedure(v_fn)) not like '%place_special_hours%' then
      raise exception 'migration check: % does not read the special dates', v_fn;
    end if;
  end loop;
  -- The grants the apps had are unchanged.
  foreach v_fn in array array[
    'public.place_is_open_now(uuid, timestamp with time zone)',
    'public.get_filtered_places(text, smallint, numeric, boolean, double precision, double precision, double precision, double precision, uuid, integer)',
    'public.get_explore_place_sections(double precision, double precision, double precision, double precision, smallint, numeric, boolean, numeric, integer, integer, integer)'
  ] loop
    if not has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'migration check: % cannot be called by the apps', v_fn;
    end if;
  end loop;
  if has_function_privilege('anon', 'public._place_open_now(uuid, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public._place_open_now(uuid, text, text)', 'execute') then
    raise exception 'migration check: _place_open_now must not be callable by the apps';
  end if;
  -- Read by everyone, written by owners only.
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.place_special_hours'::regclass) then
    raise exception 'migration check: place_special_hours has no row level security';
  end if;
  if has_table_privilege('anon', 'public.place_special_hours', 'insert')
     or has_table_privilege('anon', 'public.place_special_hours', 'update')
     or has_table_privilege('anon', 'public.place_special_hours', 'delete')
     or not has_table_privilege('anon', 'public.place_special_hours', 'select') then
    raise exception 'migration check: place_special_hours grants for anon are wrong';
  end if;
  -- Answers with nothing to place it, rather than failing.
  perform * from public.get_explore_place_sections(null, null, null, null);
  perform * from public.get_filtered_places(null, null, null, true, null, null, null, null, null, 1);
end
$$;

commit;
