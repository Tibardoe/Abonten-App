-- Seating after the first sale (2026-11-24, approved by the founder on
-- 2026-11-23; docs/architecture/assigned-seats.md).
--
-- Seats are given by the database when a ticket is inserted
-- (ticket_assign_seat, migration 20261119220000), for ticket types that
-- sell a section of the event's seating plan. Until now an organizer could
-- set or change an event's seating only before its first confirmed ticket,
-- so a ticket sold before the seating was set never got a seat, and nothing
-- could repair it: on 2026-11-23 a theatre run sold a ticket before setting
-- up its seats, the buyer called because the ticket had no seat number, and
-- the organizer could no longer add seating to that show.
--
-- Now an event's seating can be set or changed until a seat has been given
-- to one of its tickets (the old locks stay exactly as they are once seats
-- are given). When it is saved, every ticket already issued for a
-- now-seated type that still holds its place (active or checked in) gets a
-- seat right away, with the same chooser the trigger uses (an order side by
-- side when a row has room, best seats first), in the order the tickets
-- were bought, so earlier buyers get the better seats. Each holder is told
-- once (an in-app notice pushed through the delivery queue, in their own
-- language). It all happens in one transaction, in event_seating_set()
-- (service role only), which the services call after checking the
-- organizer.
--
--   * _ticket_seat_give(ticket): the chooser, lifted out of
--     ticket_assign_seat() unchanged except that it reads the ticket by id,
--     seats only a ticket that holds its place, and counts an order's
--     cancelled tickets out of the run it looks for. ticket_assign_seat()
--     now calls it; so does the backfill. ticket_seat's primary key stays
--     the safety net against a seat given twice.
--   * event_seating_set(event, plan, sections): the whole seating change.
--     Refuses when seats are already given, when the tickets sold or held
--     for a section are more than its seats, or when its ticket types would
--     sell more places than it has. A type with no number of tickets, or
--     too many, sells what the section has left after what the type already
--     holds (before any sale: the section's seats, as before).
--   * trg_notification_queue_app_push also pushes 'ticket_seat_assigned'.
--
-- A ticket sent to a friend is seated where it is now (the seat goes with
-- the ticket); tickets chosen with a pass and complimentary tickets follow
-- the rule of any issued ticket of a seated type. Each show of a run is its
-- own event: seating one show changes no other (event_add_show still copies
-- the seating of the show a new one is added from).
--
-- Replaced, checked against their fingerprints first: ticket_assign_seat
-- (20261119220000) and the WHEN list of trg_notification_queue_app_push
-- (20261120170000).

begin;

-- ---------------------------------------------------------------------------
-- Fingerprints (line endings ignored)

do $fp$
declare
  v_def text;
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'ticket_assign_seat'
      and md5(replace(p.prosrc, E'\r', '')) = 'b62d207d540a11e0889d58b296fd48fa'
  ) then
    raise exception 'seat sold tickets: public.ticket_assign_seat is not the definition this migration expects';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '_notification_queue_app_push'
      and md5(replace(p.prosrc, E'\r', '')) = 'b6929f9ebed6c58ef76e187beb167f76'
  ) then
    raise exception 'seat sold tickets: public._notification_queue_app_push is not the definition this migration expects';
  end if;

  -- The trigger's WHEN list: exactly the six types of 20261120170000.
  select pg_get_triggerdef(t.oid) into v_def
  from pg_trigger t
  where t.tgname = 'trg_notification_queue_app_push'
    and t.tgrelid = 'public.notification'::regclass;
  if v_def is null
     or position('_notification_queue_app_push()' in v_def) = 0
     or (length(v_def) - length(replace(v_def, '::text', ''))) / length('::text') <> 6
     or position('''review_received''' in v_def) = 0
     or position('''event_cancelled''' in v_def) = 0
     or position('''event_rescheduled''' in v_def) = 0
     or position('''fieldops_commission_approved''' in v_def) = 0
     or position('''fieldops_commission_paid''' in v_def) = 0
     or position('''event_reminder''' in v_def) = 0 then
    raise exception 'seat sold tickets: trg_notification_queue_app_push is not the trigger this migration expects';
  end if;
end;
$fp$;

-- ---------------------------------------------------------------------------
-- 1. The chooser, shared by the trigger and the backfill

create or replace function public._ticket_seat_give(p_ticket_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type      uuid;
  v_checkout  uuid;
  v_status    text;
  v_section   uuid;
  v_event     uuid;
  v_name      text;
  v_rows      jsonb;
  v_group     integer := 1;
  v_row       record;
  v_taken     integer[];
  v_best_row  text;
  v_best_seat integer;
  v_best_score numeric;
  v_start     integer;
  v_score     numeric;
  v_ok        boolean;
  i           integer;
  v_near      record;
  v_label     text;
begin
  select t.ticket_type_id, t.ticket_checkout_id, t.status
    into v_type, v_checkout, v_status
  from public.ticket t where t.id = p_ticket_id;
  -- Only a ticket that holds its place takes a seat.
  if v_type is null or v_status not in ('active', 'used') then
    return null;
  end if;
  select tt.seating_section_id, tt.event_id into v_section, v_event
  from public.ticket_type tt where tt.id = v_type;
  if v_section is null then
    return null;
  end if;
  if not exists (
    select 1 from public.event_seating es
    join public.seating_section s on s.plan_id = es.plan_id
    where es.event_id = v_event and s.id = v_section
  ) or exists (select 1 from public.ticket_seat where ticket_id = p_ticket_id) then
    return null;
  end if;

  -- One seat chooser per event at a time.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ticket_seat:' || v_event::text, 0)
  );

  select s.name, s.rows into v_name, v_rows from public.seating_section s where s.id = v_section;

  -- 1. Beside a seat this order already holds in the section.
  if v_checkout is not null then
    for v_near in
      select ts.row_label, ts.seat_number
      from public.ticket_seat ts
      join public.ticket t on t.id = ts.ticket_id
      where t.ticket_checkout_id = v_checkout
        and ts.event_id = v_event and ts.section_id = v_section
      order by ts.seat_number desc
    loop
      foreach i in array array[v_near.seat_number + 1, v_near.seat_number - 1]
      loop
        if i >= 1
           and i <= (select (r->>'seats')::integer from jsonb_array_elements(v_rows) r
                     where r->>'label' = v_near.row_label limit 1)
           and not exists (select 1 from public.ticket_seat x
                           where x.event_id = v_event and x.section_id = v_section
                             and x.row_label = v_near.row_label and x.seat_number = i) then
          v_best_row := v_near.row_label;
          v_best_seat := i;
          exit;
        end if;
      end loop;
      exit when v_best_row is not null;
    end loop;

    if v_best_row is null then
      -- The order's tickets of this type still to seat, this one included:
      -- those already seated in the section, and those that no longer hold
      -- a place (none when the order is being issued), are counted out.
      select greatest(1, tc.quantity - (
               select count(*) from public.ticket t
               where t.ticket_checkout_id = tc.id
                 and (t.status not in ('active', 'used')
                      or exists (select 1 from public.ticket_seat ts
                                 where ts.ticket_id = t.id and ts.section_id = v_section))))
        into v_group
      from public.ticket_checkout tc where tc.id = v_checkout;
      v_group := coalesce(v_group, 1);
    end if;
  end if;

  -- 2. The best run of free seats for the whole group: front rows first,
  --    then the run closest to the middle of the row. 3. Else one seat.
  if v_best_row is null then
    for v_group in select g from (values (v_group), (1)) v(g) where g >= 1
    loop
      for v_row in
        select r->>'label' as label, (r->>'seats')::integer as seats, ord
        from jsonb_array_elements(v_rows) with ordinality as x(r, ord)
        order by ord
      loop
        select coalesce(array_agg(ts.seat_number), '{}') into v_taken
        from public.ticket_seat ts
        where ts.event_id = v_event and ts.section_id = v_section and ts.row_label = v_row.label;
        v_best_score := null;
        for v_start in 1 .. greatest(v_row.seats - v_group + 1, 0)
        loop
          v_ok := true;
          for i in v_start .. v_start + v_group - 1
          loop
            if i = any (v_taken) then
              v_ok := false;
              exit;
            end if;
          end loop;
          if v_ok then
            v_score := abs((v_start + (v_group - 1) / 2.0) - (v_row.seats + 1) / 2.0);
            if v_best_score is null or v_score < v_best_score then
              v_best_score := v_score;
              v_best_seat := v_start;
            end if;
          end if;
        end loop;
        if v_best_score is not null then
          v_best_row := v_row.label;
          exit;
        end if;
      end loop;
      exit when v_best_row is not null;
    end loop;
  end if;

  if v_best_row is null then
    -- No seat left (stock should have stopped this): left unseated.
    return null;
  end if;

  insert into public.ticket_seat (event_id, section_id, row_label, seat_number, ticket_id)
  values (v_event, v_section, v_best_row, v_best_seat, p_ticket_id);

  v_label := v_name || ' · ' || v_best_row || v_best_seat::text;
  update public.ticket
  set seat_number = v_label
  where id = p_ticket_id;

  return v_label;
end;
$$;

comment on function public._ticket_seat_give(uuid) is
  'Gives one ticket the best seat left in its type''s section (beside its order''s seats, else the centred run for the order in the frontmost row with room, else one seat) and returns its label; null when it takes none. Shared by ticket_assign_seat() and event_seating_set(). Internal.';

-- ---------------------------------------------------------------------------
-- 2. The trigger calls it

create or replace function public.ticket_assign_seat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._ticket_seat_give(new.id);
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Setting an event's seating, and seating what was sold before

create or replace function public.event_seating_set(
  p_event_id uuid,
  p_plan_id  uuid,
  p_sections jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event   record;
  v_try     integer;
  v_locked  boolean := false;
  v_bad     record;
  v_choice  jsonb;
  v_ticket  record;
  v_label   text;
  v_seated  uuid[] := '{}';
  v_holders integer := 0;
begin
  select e.id, e.organizer_id, e.title, e.timezone, e.starts_at, e.postponed_at
    into v_event
  from public.event e where e.id = p_event_id;
  if not found then
    raise exception 'This event wasn''t found.'
      using errcode = 'no_data_found', hint = 'seating_event_not_found';
  end if;
  if p_sections is not null and jsonb_typeof(p_sections) <> 'object' then
    raise exception 'The sections are not in the expected shape.'
      using errcode = 'invalid_parameter_value', hint = 'seating_bad_request';
  end if;

  -- Hold the event (a move to another venue, event_reschedule, waits and
  -- then sees the seating), its ticket types (a ticket being issued holds
  -- its type's row until it commits, so it is either seen here or sees the
  -- new sections), the tickets that may be seated (a refund cancelling one
  -- waits), and the event's seat chooser. Taken without waiting and tried
  -- again, so a sale or a refund in flight is never caught in a deadlock.
  for v_try in 1 .. 30 loop
    begin
      perform 1 from public.event e
      where e.id = p_event_id
      for no key update nowait;
      perform 1 from public.ticket_type tt
      where tt.event_id = p_event_id
      order by tt.id
      for update nowait;
      perform 1 from public.ticket t
      join public.ticket_type tt on tt.id = t.ticket_type_id
      where tt.event_id = p_event_id and t.status in ('active', 'used')
      for no key update of t nowait;
      if not pg_catalog.pg_try_advisory_xact_lock(
        pg_catalog.hashtextextended('ticket_seat:' || p_event_id::text, 0)
      ) then
        raise exception using errcode = 'lock_not_available';
      end if;
      v_locked := true;
      exit;
    exception when lock_not_available then
      perform pg_catalog.pg_sleep(0.1);
    end;
  end loop;
  if not v_locked then
    raise exception 'Tickets are being bought for this event right now. Try again in a moment.'
      using errcode = 'lock_not_available', hint = 'seating_busy';
  end if;

  -- Once a seat is given, the seating stays as it is.
  if exists (select 1 from public.ticket_seat ts where ts.event_id = p_event_id) then
    raise exception 'Seats have been given to this event''s tickets, so its seating can no longer change.'
      using errcode = 'check_violation', hint = 'seating_locked';
  end if;

  if p_plan_id is not null and not exists (
    select 1 from public.seating_plan sp
    where sp.id = p_plan_id and sp.owner_id = v_event.organizer_id
  ) then
    raise exception 'That seating plan wasn''t found.'
      using errcode = 'no_data_found', hint = 'seating_plan_not_found';
  end if;
  if p_plan_id is not null and exists (
    select 1 from pg_catalog.jsonb_each_text(coalesce(p_sections, '{}'::jsonb)) s
    where s.value is not null and s.value <> ''
      and not exists (select 1 from public.seating_section ss
                      where ss.id = s.value::uuid and ss.plan_id = p_plan_id)
  ) then
    raise exception 'A section isn''t part of the chosen plan.'
      using errcode = 'check_violation', hint = 'seating_section_not_in_plan';
  end if;

  -- Each type's new section, the places it already holds (tickets that
  -- keep a place, and places being bought or paid for in parts: the stock
  -- rule of event_add_show) and its number of tickets once seated: a
  -- seated type with no number, or too many, sells what its section has
  -- left after what it already holds (before any sale: all its seats).
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)), '[]'::jsonb)
    into v_choice
  from (
    select c.type_id, c.section_id, c.held, s.name as section_name,
           s.seat_count,
           case
             when c.section_id is null then c.quantity
             when c.quantity is null or c.quantity + c.held > s.seat_count
               then greatest(s.seat_count - c.held, 0)
             else c.quantity
           end as quantity
    from (
      select tt.id as type_id,
             case when p_plan_id is null then null
                  else nullif(p_sections ->> tt.id::text, '')::uuid end as section_id,
             tt.quantity,
             (select count(*) from public.ticket t
              where t.ticket_type_id = tt.id and t.status in ('active', 'used'))::integer
             + coalesce((select sum(tc.quantity) from public.ticket_checkout tc
                         where tc.ticket_type_id = tt.id
                           and tc.status in ('pending', 'on_plan')), 0)::integer as held
      from public.ticket_type tt
      where tt.event_id = p_event_id
    ) c
    left join public.seating_section s on s.id = c.section_id
  ) x;

  -- The tickets sold or held for a section must fit in it.
  for v_bad in
    select c.section_name as name, c.seat_count, sum(c.held)::integer as taken
    from pg_catalog.jsonb_to_recordset(v_choice) as c(
      type_id uuid, section_id uuid, held integer, section_name text,
      seat_count integer, quantity integer)
    where c.section_id is not null
    group by c.section_id, c.section_name, c.seat_count
    having sum(c.held) > c.seat_count
    order by c.section_name
    limit 1
  loop
    raise exception '% has % seats, fewer than the % tickets already sold or held for it.',
      v_bad.name, v_bad.seat_count, v_bad.taken
      using errcode = 'check_violation', hint = 'seating_sold_do_not_fit',
            detail = pg_catalog.jsonb_build_object(
              'section', v_bad.name, 'seats', v_bad.seat_count, 'taken', v_bad.taken)::text;
  end loop;

  -- The types selling one section never sell more places than it has.
  for v_bad in
    select c.section_name as name, c.seat_count,
           (sum(c.quantity) + sum(c.held))::integer as selling
    from pg_catalog.jsonb_to_recordset(v_choice) as c(
      type_id uuid, section_id uuid, held integer, section_name text,
      seat_count integer, quantity integer)
    where c.section_id is not null
    group by c.section_id, c.section_name, c.seat_count
    having sum(c.quantity) + sum(c.held) > c.seat_count
    order by c.section_name
    limit 1
  loop
    raise exception '% has % seats, but its ticket types sell % places.',
      v_bad.name, v_bad.seat_count, v_bad.selling
      using errcode = 'check_violation', hint = 'seating_section_oversold',
            detail = pg_catalog.jsonb_build_object(
              'section', v_bad.name, 'seats', v_bad.seat_count, 'selling', v_bad.selling)::text;
  end loop;

  if p_plan_id is null then
    delete from public.event_seating where event_id = p_event_id;
  else
    insert into public.event_seating (event_id, plan_id)
    values (p_event_id, p_plan_id)
    on conflict (event_id) do update set plan_id = excluded.plan_id;
  end if;

  update public.ticket_type tt
  set seating_section_id = c.section_id,
      quantity = c.quantity
  from pg_catalog.jsonb_to_recordset(v_choice) as c(
    type_id uuid, section_id uuid, held integer, section_name text,
    seat_count integer, quantity integer)
  where tt.id = c.type_id
    and (tt.seating_section_id is distinct from c.section_id
         or tt.quantity is distinct from c.quantity);

  -- Seat what was sold before, earliest purchase first, with the chooser
  -- every issued ticket goes through.
  for v_ticket in
    select t.id
    from public.ticket t
    join public.ticket_type tt on tt.id = t.ticket_type_id
    where tt.event_id = p_event_id
      and tt.seating_section_id is not null
      and t.status in ('active', 'used')
      and not exists (select 1 from public.ticket_seat ts where ts.ticket_id = t.id)
    order by t.issued_at, t.created_at, t.ticket_checkout_id nulls last, t.id
  loop
    v_label := public._ticket_seat_give(v_ticket.id);
    if v_label is not null then
      v_seated := v_seated || v_ticket.id;
    end if;
  end loop;

  -- Each holder is told once, with every seat they now hold. Pushed by
  -- trg_notification_queue_app_push; worded in the reader's language from
  -- data.notice (@abonten/core/notifications/notices).
  if pg_catalog.cardinality(v_seated) > 0 then
    with seated as (
      select t.id, t.user_id, t.seat_number, u.n, o.starts_at as occurrence_starts_at
      from unnest(v_seated) with ordinality as u(id, n)
      join public.ticket t on t.id = u.id
      left join public.event_occurrence o on o.id = t.occurrence_id
    ),
    people as (
      select s.user_id,
             count(*)::integer as seats_count,
             string_agg(s.seat_number, ', ' order by s.n) as seats,
             (array_agg(s.id order by s.n))[1] as ticket_id,
             min(s.occurrence_starts_at) as occurrence_starts_at
      from seated s
      group by s.user_id
    ),
    inserted as (
      insert into public.notification (user_id, type, title, body, link, data)
      select p.user_id,
             'ticket_seat_assigned',
             case when p.seats_count = 1 then 'Your seat for ' else 'Your seats for ' end
               || v_event.title,
             p.seats || '. '
               || case when p.seats_count = 1 then 'It''s on your ticket.'
                       else 'They''re on your tickets.' end,
             '/manage/my-events',
             pg_catalog.jsonb_build_object(
               'kind', 'ticket',
               'eventId', p_event_id,
               'ticketId', p.ticket_id,
               'notice', pg_catalog.jsonb_build_object(
                 'id', 'ticket_seat_assigned',
                 -- Every param is present (null when unknown): a message
                 -- words a missing date itself.
                 'params', pg_catalog.jsonb_build_object(
                   'title', v_event.title,
                   'seats', p.seats,
                   'count', p.seats_count,
                   'startsAt', case
                     when v_event.postponed_at is not null then null
                     else to_char(
                       coalesce(p.occurrence_starts_at, v_event.starts_at) at time zone 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                   end,
                   'timezone', v_event.timezone
                 )
               )
             )
      from people p
      returning 1
    )
    select count(*) into v_holders from inserted;
  end if;

  return pg_catalog.jsonb_build_object(
    'seated', pg_catalog.cardinality(v_seated),
    'holders', v_holders
  );
end;
$$;

comment on function public.event_seating_set(uuid, uuid, jsonb) is
  'Gives an event a seating plan (or none) and each ticket type a section (p_sections: {type id: section id or null}), until a seat is given; seats the tickets already sold for the now-seated types (earliest purchase first) and tells each holder once. Returns {seated, holders}. Service role only; the caller has checked the organizer (docs/architecture/assigned-seats.md).';

-- ---------------------------------------------------------------------------
-- 4. The seat notice is pushed like the other notices the database writes

drop trigger if exists trg_notification_queue_app_push on public.notification;
create trigger trg_notification_queue_app_push
  after insert on public.notification
  for each row
  when (new.type = any (array[
    'review_received', 'event_cancelled', 'event_rescheduled',
    'fieldops_commission_approved', 'fieldops_commission_paid',
    'event_reminder', 'ticket_seat_assigned']))
  execute function public._notification_queue_app_push();

-- ---------------------------------------------------------------------------
-- 5. Grants

revoke all on function public._ticket_seat_give(uuid) from public, anon, authenticated, service_role;
revoke all on function public.ticket_assign_seat() from public, anon, authenticated;
revoke all on function public.event_seating_set(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.event_seating_set(uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Checks

do $check$
declare
  v_def text;
begin
  if has_function_privilege('authenticated', 'public.event_seating_set(uuid, uuid, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.event_seating_set(uuid, uuid, jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.event_seating_set(uuid, uuid, jsonb)', 'execute') then
    raise exception 'migration check: event_seating_set is service role only';
  end if;
  if has_function_privilege('authenticated', 'public._ticket_seat_give(uuid)', 'execute')
     or has_function_privilege('anon', 'public._ticket_seat_give(uuid)', 'execute')
     or has_function_privilege('service_role', 'public._ticket_seat_give(uuid)', 'execute') then
    raise exception 'migration check: _ticket_seat_give is internal';
  end if;

  -- The trigger seats through the shared chooser.
  if not exists (
    select 1 from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgname = 'trg_ticket_assign_seat'
      and t.tgrelid = 'public.ticket'::regclass
      and p.proname = 'ticket_assign_seat'
      and position('public._ticket_seat_give(new.id)' in p.prosrc) > 0
  ) then
    raise exception 'migration check: ticket_assign_seat does not call the shared chooser';
  end if;

  select pg_get_triggerdef(t.oid) into v_def
  from pg_trigger t
  where t.tgname = 'trg_notification_queue_app_push'
    and t.tgrelid = 'public.notification'::regclass;
  if v_def is null or position('''ticket_seat_assigned''' in v_def) = 0
     or position('''event_reminder''' in v_def) = 0 then
    raise exception 'migration check: the seat notice is not pushed';
  end if;
end;
$check$;

commit;
