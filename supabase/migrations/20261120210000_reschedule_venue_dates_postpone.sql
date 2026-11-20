-- Moving an event, part 2 (2026-11-20, docs/architecture/event-reschedule.md;
-- the founder asked for "all of Not in this version"):
--
--   * a new venue (alone or with a new date), in the same country; refused
--     for an event with a seating plan (its seats belong to the old hall);
--   * one date of an event with several dates (event_occurrence): only the
--     people holding that date are told and may give those tickets back;
--   * "postponed, new date to come": the event keeps its old dates and gets
--     event.postponed_at; sales stop, it leaves the lists, no reminder goes
--     out, the door refuses its tickets, its money is not settled and it is
--     not retired; holders may give their tickets back for a full refund
--     until the organizer sets the new date (an ordinary move, which clears
--     the postponement and opens the usual 7-day window).
--
-- event_reschedule() gains the venue, the date and the postponement and is
-- dropped and made again (checked against the definition this was written
-- against); event_reschedule records the kind, the date and the venue;
-- get_event_reschedule() and get_event_shows() say more and are made again.
-- The postponement guards are one-line changes to the functions that sell,
-- list, remind, settle and retire, each checked against its fingerprint and
-- its anchor.

begin;

-- ---------------------------------------------------------------------------
-- Fingerprints (line endings ignored)
do $fp$
declare
  r record;
begin
  for r in
    select * from (values
      ('event_reschedule',          '9ee999745722647e6c4f96b36311cbc8'),
      ('get_event_reschedule',      '95882c25da2a52db938ac4dff27ca82e'),
      ('get_event_shows',           '82cf20248021c9a3aefdcae83f7bf855'),
      ('is_event_settled',          'b54ad0ab62fc6bce7a4f773abf18b216'),
      ('_event_settles_at',         '6381e77e151ab2a4be65b4af7ca0620f'),
      ('retire_ended_events',       '537af238c2162c2c4ddcaec81d01a59d'),
      ('ticket_plan_work_due',      '6a02e37594266ec3c33d6b24f5fbdaea'),
      ('event_reminders_enqueue',   'f41a2b0fecb0cbb546f5c6c2650380ea'),
      ('_search_event_pool',        '04c7577f7d7e6bc027c33c61f1cf8990'),
      ('_explore_event_candidates', 'b7056727d629d1a97a4e182be620d121'),
      ('create_ticket_checkout',    '626591122fc72cc275f6148882a315cd'),
      ('issue_free_ticket',         'c22bd8708cbd7279c389ac3eb78ca620'),
      ('ticket_pass_claim',         '8237a900156d26eaf0c46847249fdf79')
    ) as f(name, fingerprint)
  loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = r.name
        and md5(replace(p.prosrc, E'\r', '')) = r.fingerprint
    ) then
      raise exception 'rescheduling: public.% is not the definition this migration expects', r.name;
    end if;
  end loop;
end;
$fp$;

-- ---------------------------------------------------------------------------
-- Postponed events

alter table public.event
  add column if not exists postponed_at timestamptz;

comment on column public.event.postponed_at is
  'Set while the organizer has postponed the event and no new date is set (event_reschedule() only). The old dates stay; sales, lists, reminders, check-in, settlement and retirement wait for the new date.';

create index if not exists event_postponed_idx
  on public.event (postponed_at) where postponed_at is not null;

-- Clients never postpone or un-postpone an event themselves.
create or replace function public.guard_event_postponed_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.postponed_at is not null)
     or (tg_op = 'UPDATE' and new.postponed_at is distinct from old.postponed_at) then
    raise exception 'Postponing an event goes through moving it.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_event_postponed_column on public.event;
create trigger trg_guard_event_postponed_column
  before insert or update of postponed_at on public.event
  for each row execute function public.guard_event_postponed_column();

-- ---------------------------------------------------------------------------
-- The record of each move: its kind, the date it moved and the venue.

alter table public.event_reschedule
  add column if not exists kind text not null default 'move',
  add column if not exists occurrence_id uuid references public.event_occurrence(id) on delete set null,
  add column if not exists venue_moved boolean not null default false,
  add column if not exists previous_address jsonb,
  add column if not exists previous_place_id uuid references public.place(id) on delete set null,
  add column if not exists address jsonb,
  add column if not exists place_id uuid references public.place(id) on delete set null,
  alter column starts_at drop not null,
  alter column ends_at drop not null,
  alter column refund_until drop not null;

alter table public.event_reschedule
  drop constraint if exists event_reschedule_kind_check;
alter table public.event_reschedule
  add constraint event_reschedule_kind_check check (
    (kind = 'move' and starts_at is not null and ends_at is not null and refund_until is not null)
    or (kind = 'postpone' and starts_at is null and ends_at is null and refund_until is null)
  );

comment on column public.event_reschedule.kind is
  '''move'' (a new date, a new venue or both) or ''postpone'' (no new date yet: holders may give tickets back until one is set).';
comment on column public.event_reschedule.occurrence_id is
  'The date of an event with several dates that moved; null when the event moved as a whole.';

-- ---------------------------------------------------------------------------
-- event_reschedule(): a new date, a new venue, one date, or a postponement.

drop function public.event_reschedule(uuid, uuid, timestamptz, timestamptz, text);

create function public.event_reschedule(
  p_event_id      uuid,
  p_actor         uuid,
  p_starts_at     timestamptz,
  p_ends_at       timestamptz,
  p_message       text,
  p_occurrence_id uuid default null,
  p_postpone      boolean default false,
  p_place_id      uuid default null,
  p_latitude      double precision default null,
  p_longitude     double precision default null,
  p_address       jsonb default null,
  p_country_code  text default null,
  p_timezone      text default null
)
returns table (reschedule_id uuid, holders integer, refund_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event       public.event%rowtype;
  v_occ         public.event_occurrence%rowtype;
  v_place       public.place%rowtype;
  v_message     text := btrim(coalesce(p_message, ''));
  v_postpone    boolean := coalesce(p_postpone, false);
  v_has_dates   boolean;
  v_date        boolean := p_starts_at is not null or p_ends_at is not null;
  v_venue       boolean := p_place_id is not null or p_latitude is not null or p_longitude is not null;
  v_location    extensions.geography;
  v_address     jsonb;
  v_place_id    uuid;
  v_timezone    text;
  v_venue_moved boolean := false;
  v_prev_start  timestamptz;
  v_prev_end    timestamptz;
  v_next_start  timestamptz;
  v_date_same   boolean := false;
  v_shift       interval;
  v_until       timestamptz;
  v_id          uuid;
  v_holders     integer;
  v_notice      text;
  v_venue_label text;
begin
  select * into v_event from public.event where id = p_event_id for update;
  if not found then
    raise exception 'event_reschedule: no such event' using errcode = 'no_data_found';
  end if;
  if v_event.status is distinct from 'published' then
    raise exception 'Only a published event can be moved.'
      using errcode = 'check_violation';
  end if;
  if length(v_message) = 0 or length(v_message) > 1000 then
    raise exception 'Write a message for your ticket holders (up to 1,000 characters).'
      using errcode = 'check_violation';
  end if;
  v_has_dates := exists (select 1 from public.event_occurrence o where o.event_id = p_event_id);

  -- What is asked, and whether it can be done.
  if v_postpone then
    if v_date or v_venue or p_occurrence_id is not null then
      raise exception 'event_reschedule: a postponement takes only a message';
    end if;
    if v_has_dates then
      raise exception 'An event with several dates can''t be postponed. Move or cancel its dates instead.'
        using errcode = 'check_violation';
    end if;
    if v_event.postponed_at is not null then
      raise exception 'This event is already postponed.'
        using errcode = 'check_violation';
    end if;
    if v_event.starts_at is null or v_event.starts_at <= now() then
      raise exception 'This event has already started, so it can''t be moved.'
        using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.event_reschedule r
               where r.event_id = p_event_id and r.kind = 'postpone') then
      raise exception 'This event has already been postponed once.'
        using errcode = 'check_violation';
    end if;
  elsif p_occurrence_id is not null then
    select * into v_occ from public.event_occurrence o
    where o.id = p_occurrence_id and o.event_id = p_event_id
    for update;
    if not found then
      raise exception 'event_reschedule: no such date' using errcode = 'no_data_found';
    end if;
    if v_venue then
      raise exception 'A new venue is for every date: change it without choosing a date.'
        using errcode = 'check_violation';
    end if;
    if not v_date then
      raise exception 'event_reschedule: a date needs its new start and end';
    end if;
    if v_occ.starts_at <= now() then
      raise exception 'This date has already started, so it can''t be moved.'
        using errcode = 'check_violation';
    end if;
  else
    if not v_date and not v_venue then
      raise exception 'event_reschedule: nothing to move';
    end if;
    if v_has_dates and v_date then
      raise exception 'An event with several dates moves one date at a time.'
        using errcode = 'check_violation';
    end if;
    if v_event.postponed_at is not null and not v_date then
      raise exception 'Give the postponed event its new date.'
        using errcode = 'check_violation';
    end if;
    -- A postponed event is moved to its new date whatever its old one was.
    if v_event.postponed_at is null and coalesce(
         (select min(o.starts_at) from public.event_occurrence o where o.event_id = p_event_id),
         v_event.starts_at,
         now()) <= now() then
      raise exception 'This event has already started, so it can''t be moved.'
        using errcode = 'check_violation';
    end if;
  end if;

  if v_date then
    if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
      raise exception 'A show needs a start and an end after it.'
        using errcode = 'check_violation';
    end if;
    if p_starts_at <= now() + interval '2 hours' then
      raise exception 'The new date must be at least two hours from now.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- The venue: the event's, an Abonten place, or an address the service
  -- resolved (country and time zone from the point).
  v_location := v_event.location;
  v_address  := v_event.address;
  v_place_id := v_event.place_id;
  v_timezone := v_event.timezone;
  if p_place_id is not null then
    select * into v_place from public.place pl where pl.id = p_place_id;
    if not found
       or v_place.status is distinct from 'published'
       or v_place.moderation_state in ('hidden', 'removed')
       or v_place.location is null then
      raise exception 'That place can''t host a show on Abonten.'
        using errcode = 'check_violation';
    end if;
    if v_place.country_code is distinct from v_event.country_code then
      raise exception 'An event can''t move to another country. Create a new event there instead.'
        using errcode = 'check_violation';
    end if;
    v_location := v_place.location;
    v_address  := coalesce(p_address, v_place.address);
    v_place_id := v_place.id;
    v_timezone := coalesce(nullif(btrim(v_place.timezone), ''), v_event.timezone);
  elsif p_latitude is not null or p_longitude is not null then
    if p_latitude is null or p_longitude is null
       or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
       or p_address is null or coalesce(btrim(p_address ->> 'full_address'), '') = '' then
      raise exception 'event_reschedule: a venue needs a point and an address';
    end if;
    if upper(btrim(coalesce(p_country_code, ''))) is distinct from v_event.country_code::text then
      raise exception 'An event can''t move to another country. Create a new event there instead.'
        using errcode = 'check_violation';
    end if;
    v_location := extensions.st_setsrid(
      extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;
    v_address  := p_address;
    v_place_id := null;
    v_timezone := coalesce(nullif(btrim(p_timezone), ''), v_event.timezone);
  end if;
  if v_venue then
    v_venue_moved := v_event.location is null
                     or not extensions.st_dwithin(v_location, v_event.location, 100)
                     or v_place_id is distinct from v_event.place_id;
    if v_venue_moved and not extensions.st_dwithin(v_location, coalesce(v_event.location, v_location), 100)
       and exists (select 1 from public.event_seating s where s.event_id = p_event_id) then
      raise exception 'An event with a seating plan can''t move to another venue.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- The dates it moves from.
  if p_occurrence_id is not null then
    v_prev_start := v_occ.starts_at;
    v_prev_end   := v_occ.ends_at;
  else
    v_prev_start := coalesce(v_event.starts_at,
      (select min(o.starts_at) from public.event_occurrence o
       where o.event_id = p_event_id and o.ends_at > now()));
    v_prev_end   := v_event.ends_at;
  end if;

  if not v_postpone then
    v_date_same := v_date and p_starts_at = v_prev_start
                   and p_ends_at is not distinct from v_prev_end
                   and v_event.postponed_at is null;
    if (not v_date or v_date_same) and not v_venue_moved then
      raise exception 'Choose a different date, time or venue.'
        using errcode = 'check_violation';
    end if;
    if (select count(*) from public.event_reschedule r
        where r.event_id = p_event_id and r.kind = 'move'
          and r.occurrence_id is not distinct from p_occurrence_id) >= 2 then
      if p_occurrence_id is not null then
        raise exception 'This date has already been moved twice.'
          using errcode = 'check_violation';
      end if;
      raise exception 'This event has already been moved twice.'
        using errcode = 'check_violation';
    end if;
    -- One show per time at a venue in a run.
    if v_date and v_event.series_id is not null and exists (
      select 1 from public.event e
      where e.series_id = v_event.series_id and e.id <> p_event_id
        and e.starts_at = p_starts_at
        and e.status = 'published' and e.archived_at is null
        and (e.location is null or v_location is null
             or extensions.st_dwithin(e.location, v_location, 100))
    ) then
      raise exception 'This run already has a show at that time.'
        using errcode = 'unique_violation';
    end if;
  end if;

  -- Holders may give their tickets back for a full refund for 7 days, and
  -- no later than 48 hours before the (new) date; never less than a day
  -- (nor past the start) when the date is close. While postponed: until the
  -- new date is set.
  if v_postpone then
    v_until := null;
  else
    v_next_start := coalesce(p_starts_at, v_prev_start);
    v_until := least(now() + interval '7 days', v_next_start - interval '48 hours');
    if v_until < least(now() + interval '24 hours', v_next_start) then
      v_until := least(now() + interval '24 hours', v_next_start);
    end if;
  end if;

  insert into public.event_reschedule (
    event_id, moved_by, kind, occurrence_id, previous_starts_at, previous_ends_at,
    starts_at, ends_at, message, refund_until,
    venue_moved, previous_address, previous_place_id, address, place_id
  ) values (
    p_event_id, p_actor, case when v_postpone then 'postpone' else 'move' end, p_occurrence_id,
    v_prev_start, v_prev_end,
    case when v_postpone then null else coalesce(p_starts_at, v_prev_start) end,
    case when v_postpone then null else coalesce(p_ends_at, v_prev_end, v_prev_start) end,
    v_message, v_until,
    v_venue_moved,
    case when v_venue_moved then v_event.address end,
    case when v_venue_moved then v_event.place_id end,
    case when v_venue_moved then v_address end,
    case when v_venue_moved then v_place_id end
  )
  returning id into v_id;

  -- Apply it.
  if v_postpone then
    update public.event set postponed_at = now() where id = p_event_id;
  end if;

  if v_venue_moved then
    update public.event
    set location = v_location,
        address  = v_address,
        place_id = v_place_id,
        timezone = v_timezone
    where id = p_event_id;
  end if;

  if v_date and p_occurrence_id is not null then
    update public.event_occurrence
    set starts_at = p_starts_at,
        ends_at   = p_ends_at
    where id = p_occurrence_id;
    -- A ticket stays valid until the event's last date ends.
    update public.ticket t
    set expires_at = (select max(o.ends_at) from public.event_occurrence o
                      where o.event_id = p_event_id),
        updated_at = now()
    from public.ticket_type tt
    where tt.id = t.ticket_type_id
      and tt.event_id = p_event_id
      and t.status = 'active';
    -- Plans for that date keep the same distance to it.
    v_shift := p_starts_at - v_occ.starts_at;
    update public.ticket_plan p
    set event_starts_at = p_starts_at,
        deadline_at = p.deadline_at + v_shift
    where p.event_id = p_event_id
      and p.occurrence_id = p_occurrence_id
      and p.status in ('awaiting_payment', 'active');
    update public.ticket_checkout c
    set expires_at = c.expires_at + v_shift
    where c.event_id = p_event_id
      and c.occurrence_id = p_occurrence_id
      and c.status = 'on_plan'
      and c.expires_at is not null;
  elsif v_date then
    update public.event
    set starts_at = p_starts_at,
        ends_at = p_ends_at,
        postponed_at = null
    where id = p_event_id;
    -- Live tickets stay valid until the new end.
    update public.ticket t
    set expires_at = p_ends_at,
        updated_at = now()
    from public.ticket_type tt
    where tt.id = t.ticket_type_id
      and tt.event_id = p_event_id
      and t.status = 'active';
    -- Running Pay small small plans keep the same distance to the date.
    v_shift := p_starts_at - v_event.starts_at;
    update public.ticket_plan p
    set event_starts_at = p_starts_at,
        deadline_at = p.deadline_at + v_shift
    where p.event_id = p_event_id
      and p.status in ('awaiting_payment', 'active');
    update public.ticket_checkout c
    set expires_at = c.expires_at + v_shift
    where c.event_id = p_event_id
      and c.status = 'on_plan'
      and c.expires_at is not null;
  end if;

  -- One notice per person holding a ticket or a running plan (for one date:
  -- that date's), pushed through the delivery queue.
  v_venue_label := coalesce(
    (select pl.name from public.place pl where pl.id = v_place_id and v_venue_moved),
    nullif(btrim(v_address ->> 'full_address'), ''));
  v_notice := case
    when v_postpone then 'event_postponed'
    when p_occurrence_id is not null then 'event_date_moved'
    when v_venue_moved and v_date and not v_date_same then 'event_moved_venue'
    when v_venue_moved then 'event_venue_changed'
    else 'event_rescheduled'
  end;

  with tickets as (
    select t.user_id, t.id
    from public.ticket t
    join public.ticket_type tt on tt.id = t.ticket_type_id
    where tt.event_id = p_event_id and t.status = 'active' and t.user_id is not null
      and (p_occurrence_id is null or t.occurrence_id = p_occurrence_id)
  ),
  people as (
    select tk.user_id, min(tk.id::text)::uuid as ticket_id
    from tickets tk
    group by tk.user_id
    union
    select p.user_id, null::uuid
    from public.ticket_plan p
    where p.event_id = p_event_id
      and p.status in ('awaiting_payment', 'active')
      and (p_occurrence_id is null or p.occurrence_id = p_occurrence_id)
      and not exists (select 1 from tickets tk where tk.user_id = p.user_id)
  ),
  inserted as (
    insert into public.notification (user_id, type, title, body, link, data)
    select pe.user_id,
           'event_rescheduled',
           case
             when v_postpone then v_event.title || ' is postponed'
             when v_notice = 'event_venue_changed' then v_event.title || ' has a new venue'
             else v_event.title || ' has moved'
           end,
           case
             when v_postpone then 'A new date is to come. Open your ticket to keep it or get a full refund.'
             else 'Open your ticket to keep it or get a full refund.'
           end,
           '/manage/my-events',
           jsonb_strip_nulls(jsonb_build_object(
             'kind', 'ticket',
             'eventId', p_event_id,
             'ticketId', pe.ticket_id,
             'ticketsSection', 'active',
             'rescheduleId', v_id,
             'notice', jsonb_build_object(
               'id', v_notice,
               'params', jsonb_strip_nulls(jsonb_build_object(
                 'title', v_event.title,
                 'startsAt', case when v_postpone then null else
                   to_char(coalesce(p_starts_at, v_prev_start) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
                 'previousStartsAt', case when p_occurrence_id is not null then
                   to_char(v_prev_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
                 'timezone', v_timezone,
                 'venue', case when v_venue_moved then v_venue_label end
               ))
             )
           ))
    from people pe
    returning 1
  )
  select count(*) into v_holders from inserted;

  update public.event_reschedule set holders = v_holders where id = v_id;

  return query select v_id, v_holders, v_until;
end;
$$;

comment on function public.event_reschedule(uuid, uuid, timestamptz, timestamptz, text, uuid, boolean, uuid, double precision, double precision, jsonb, text, text) is
  'Moves a published event that has not started (or a postponed one) to a new date, a new venue in the same country, or both; moves one date of an event with several dates; or postpones a single-date event with no new date yet. Records the move and tells every holder (docs/architecture/event-reschedule.md). Service role only; the caller has checked the organizer.';

-- ---------------------------------------------------------------------------
-- get_event_reschedule(): the latest move of a public event, with its kind.

drop function public.get_event_reschedule(uuid);

create function public.get_event_reschedule(p_event_id uuid)
returns table (
  previous_starts_at timestamptz,
  starts_at          timestamptz,
  moved_at           timestamptz,
  message            text,
  refund_until       timestamptz,
  moves              integer,
  kind               text,
  occurrence_id      uuid,
  venue_moved        boolean,
  postponed          boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.previous_starts_at, r.starts_at, r.created_at, r.message, r.refund_until,
         (select count(*)::integer from public.event_reschedule x
          where x.event_id = r.event_id and x.kind = 'move'),
         r.kind, r.occurrence_id, r.venue_moved, e.postponed_at is not null
  from public.event_reschedule r
  join public.event e on e.id = r.event_id
  where r.event_id = p_event_id
    and e.status::text in ('published', 'canceled')
    and e.moderation_state is distinct from 'removed'
  order by r.created_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- get_event_shows(): a postponed show says so.

drop function public.get_event_shows(uuid);

create function public.get_event_shows(p_event_id uuid)
returns table (
  id            uuid,
  event_code    text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  timezone      text,
  status        text,
  seats_left    integer,
  sold_out      boolean,
  place_id      uuid,
  venue_name    text,
  venue_address text,
  city          text,
  postponed     boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  with me as (
    select e.series_id from public.event e where e.id = p_event_id
  ),
  shows as (
    select e.*
    from public.event e, me
    where me.series_id is not null
      and e.series_id = me.series_id
      and e.status in ('published', 'canceled')
      and e.archived_at is null
      and e.moderation_state is distinct from 'hidden'
      and e.moderation_state is distinct from 'removed'
      and e.country_code <> all ((select public.hidden_listing_countries())::text[])
      and (coalesce(e.ends_at, e.starts_at) > now() or e.postponed_at is not null)
  ),
  counts as (
    select s.id,
           s.capacity
             - coalesce((select sum(a.number_of_tickets) from public.attendance a
                         where a.event_id = s.id and a.status = 'attending'), 0)
             - coalesce((select sum(c.quantity) from public.ticket_checkout c
                         where c.event_id = s.id and c.status in ('pending', 'on_plan')), 0)
             as capacity_left,
           -- Stock limits only bind when every type has one.
           case when bool_and(tt.quantity is not null) then sum(greatest(tt.quantity, 0)) end as stock_left,
           bool_and(tt.quantity is not null and tt.quantity < tt.admits) as types_out,
           count(tt.id) as type_count
    from shows s
    left join public.ticket_type tt on tt.event_id = s.id
    group by s.id, s.capacity
  )
  select s.id, s.event_code, s.starts_at, s.ends_at, s.timezone::text, s.status::text,
         case
           when c.capacity_left is null then c.stock_left::integer
           when c.stock_left is null then greatest(c.capacity_left, 0)::integer
           else least(greatest(c.capacity_left, 0), c.stock_left)::integer
         end,
         s.status = 'canceled'
           or (c.capacity_left is not null and c.capacity_left <= 0)
           or (c.type_count > 0 and c.types_out),
         -- The venue: a place's name only while the place is listed.
         case when pl.id is not null then s.place_id end,
         pl.name,
         nullif(btrim(s.address ->> 'full_address'), ''),
         nullif(btrim(s.address ->> 'city'), ''),
         s.postponed_at is not null
  from shows s
  join counts c on c.id = s.id
  left join public.place pl
    on pl.id = s.place_id
   and pl.status = 'published'
   and pl.moderation_state is distinct from 'hidden'
   and pl.moderation_state is distinct from 'removed'
  order by s.starts_at, s.id;
$function$;

comment on function public.get_event_shows(uuid) is
  'The upcoming shows of the run an event belongs to, with seats left, each show''s venue and whether it is postponed (empty when it is not in a run). Public read (docs/architecture/show-runs.md).';

-- ---------------------------------------------------------------------------
-- Money waits: a postponed event is never settled.

create or replace function public.is_event_settled(p_event_id uuid)
returns boolean
language sql
stable
set search_path to ''
as $function$
  SELECT COALESCE(
    e.status <> 'canceled'
    AND e.postponed_at IS NULL
    AND now() >= COALESCE(
      (SELECT MAX(eo.ends_at) FROM public.event_occurrence eo WHERE eo.event_id = e.id),
      e.ends_at
    ) + interval '48 hours',
    false
  )
  FROM public.event e
  WHERE e.id = p_event_id;
$function$;

create or replace function public._event_settles_at(p_event_id uuid)
returns timestamptz
language sql
stable
set search_path to ''
as $function$
  select case
    -- Postponed: not before the new date is set and has passed.
    when e.postponed_at is not null then 'infinity'::timestamptz
    else coalesce(
      (select max(eo.ends_at) from public.event_occurrence eo where eo.event_id = e.id),
      e.ends_at,
      e.starts_at,
      now()
    ) + interval '48 hours'
  end
  from public.event e
  where e.id = p_event_id;
$function$;

-- A postponed event is not over: it is not retired.
create or replace function public.retire_ended_events()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_archived integer;
begin
  with ended as (
    select e.id
    from public.event e
    where e.archived_at is null
      and e.postponed_at is null
      and case
            when exists (select 1 from public.event_occurrence o where o.event_id = e.id)
              then not exists (select 1 from public.event_occurrence o
                               where o.event_id = e.id and o.ends_at >= now())
            else e.ends_at is not null and e.ends_at < now()
          end
    -- A row someone is editing right now is retired by the next run.
    for update of e skip locked
  )
  update public.event e
  set archived_at = now()
  from ended
  where e.id = ended.id;
  get diagnostics v_archived = row_count;

  return jsonb_build_object('archived', v_archived, 'at', now());
end;
$function$;

-- ---------------------------------------------------------------------------
-- One-line guards, each checked against its anchor.

do $guards$
declare
  v_fn  regprocedure;
  v_def text;
  v_new text;
  v_n   integer;
begin
  -- Reminders: none for a postponed event (its old date may come round).
  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'event_reminders_enqueue';
  v_def := pg_get_functiondef(v_fn);
  v_new := replace(v_def,
$a$      and e.archived_at is null
      and coalesce(e.moderation_state, 'visible') not in ('hidden', 'removed')$a$,
$b$      and e.archived_at is null
      and e.postponed_at is null
      and coalesce(e.moderation_state, 'visible') not in ('hidden', 'removed')$b$);
  if v_new = v_def then
    raise exception 'rescheduling: the event filter of event_reminders_enqueue was not found';
  end if;
  execute v_new;

  -- Pay small small: a plan for a postponed event does not lapse.
  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'ticket_plan_work_due';
  v_def := pg_get_functiondef(v_fn);
  v_new := replace(v_def,
$a$               where p.status = 'active' and p.deadline_at < now())$a$,
$b$               where p.status = 'active' and p.deadline_at < now()
                 and not exists (select 1 from public.event e
                                 where e.id = p.event_id and e.postponed_at is not null))$b$);
  if v_new = v_def then
    raise exception 'rescheduling: the deadline check of ticket_plan_work_due was not found';
  end if;
  execute v_new;

  -- Search: a postponed event is listed again when it has its new date.
  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_search_event_pool';
  v_def := pg_get_functiondef(v_fn);
  v_n := (length(v_def) - length(replace(v_def, 'e.archived_at is null', '')))
         / length('e.archived_at is null');
  if v_n <> 7 then
    raise exception 'rescheduling: _search_event_pool has % event filters, expected 7', v_n;
  end if;
  execute replace(v_def, 'e.archived_at is null',
                  'e.archived_at is null and e.postponed_at is null');

  -- Explore and every event list.
  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_explore_event_candidates';
  v_def := pg_get_functiondef(v_fn);
  v_new := replace(v_def,
$a$  where e.status = 'published'
    and e.archived_at is null
    and e.moderation_state is distinct from 'hidden'$a$,
$b$  where e.status = 'published'
    and e.archived_at is null
    and e.postponed_at is null
    and e.moderation_state is distinct from 'hidden'$b$);
  if v_new = v_def then
    raise exception 'rescheduling: the event filter of _explore_event_candidates was not found';
  end if;
  execute v_new;

  -- Sales stop while postponed.
  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_ticket_checkout';
  v_def := pg_get_functiondef(v_fn);
  v_new := replace(v_def,
$a$  if v_event_status is distinct from 'published' then
    raise exception 'This event is not currently on sale.'$a$,
$b$  if exists (select 1 from public.event pe where pe.id = p_event_id and pe.postponed_at is not null) then
    raise exception 'This event is postponed. Tickets go on sale again when it has a new date.'
      using errcode = 'check_violation';
  end if;

  if v_event_status is distinct from 'published' then
    raise exception 'This event is not currently on sale.'$b$);
  if v_new = v_def then
    raise exception 'rescheduling: the status check of create_ticket_checkout was not found';
  end if;
  execute v_new;

  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'issue_free_ticket';
  v_def := pg_get_functiondef(v_fn);
  v_new := replace(v_def,
$a$  if v_event_status is distinct from 'published' then
    raise exception 'This event is no longer accepting RSVPs.'$a$,
$b$  if exists (select 1 from public.event pe where pe.id = p_event_id and pe.postponed_at is not null) then
    raise exception 'This event is postponed. Tickets go on sale again when it has a new date.'
      using errcode = 'check_violation';
  end if;

  if v_event_status is distinct from 'published' then
    raise exception 'This event is no longer accepting RSVPs.'$b$);
  if v_new = v_def then
    raise exception 'rescheduling: the status check of issue_free_ticket was not found';
  end if;
  execute v_new;

  -- A pass cannot choose a postponed show.
  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'ticket_pass_claim';
  v_def := pg_get_functiondef(v_fn);
  v_new := replace(v_def,
$a$     or v_target.moderation_state in ('hidden', 'removed') then
    raise exception 'This show can no longer be chosen.'$a$,
$b$     or v_target.moderation_state in ('hidden', 'removed')
     or v_target.postponed_at is not null then
    raise exception 'This show can no longer be chosen.'$b$);
  if v_new = v_def then
    raise exception 'rescheduling: the show check of ticket_pass_claim was not found';
  end if;
  execute v_new;
end;
$guards$;

-- ---------------------------------------------------------------------------
-- Grants

revoke all on function public.event_reschedule(uuid, uuid, timestamptz, timestamptz, text, uuid, boolean, uuid, double precision, double precision, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.event_reschedule(uuid, uuid, timestamptz, timestamptz, text, uuid, boolean, uuid, double precision, double precision, jsonb, text, text)
  to service_role;

revoke all on function public.get_event_reschedule(uuid) from public;
grant execute on function public.get_event_reschedule(uuid) to anon, authenticated, service_role;

revoke all on function public.get_event_shows(uuid) from public;
grant execute on function public.get_event_shows(uuid) to anon, authenticated, service_role;

do $check$
begin
  if has_function_privilege('authenticated', 'public.event_reschedule(uuid, uuid, timestamptz, timestamptz, text, uuid, boolean, uuid, double precision, double precision, jsonb, text, text)', 'execute')
     or has_function_privilege('anon', 'public.event_reschedule(uuid, uuid, timestamptz, timestamptz, text, uuid, boolean, uuid, double precision, double precision, jsonb, text, text)', 'execute') then
    raise exception 'migration check: event_reschedule is service role only';
  end if;
  if not has_function_privilege('anon', 'public.get_event_reschedule(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.get_event_shows(uuid)', 'execute') then
    raise exception 'migration check: the move and the shows stay public reads';
  end if;
end;
$check$;

commit;
