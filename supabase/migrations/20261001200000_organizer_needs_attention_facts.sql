-- The organizer dashboard's "Needs attention" list said its piece in English
-- to everyone: get_organizer_needs_attention built the sentence itself
-- ("Starts Oct 06 with no sales yet."), with the day worked out in the
-- database's own time zone rather than the event's.
--
-- The function now also returns the facts the sentence was made from, so
-- each app words it in the reader's language and shows the day in the
-- event's zone:
--
--   starts_at     when the event (its first coming occurrence) starts
--   timezone      the event's zone
--   sold          tickets sold so far (no_sales_yet, low_registrations)
--   remaining     tickets left of the tier (nearly_sold_out)
--   ticket_type   the tier's name (nearly_sold_out)
--
-- `message` stays, in English, for the app versions already installed:
-- they print it as it comes. Nothing else about the three rules changes.
--
-- A return type cannot be changed in place, so the function is dropped and
-- made again in the same transaction. get_organizer_dashboard reads it by
-- name at call time (a SQL function with a text body), so it is not
-- affected by the drop.

drop function if exists public.get_organizer_needs_attention(integer);

create function public.get_organizer_needs_attention(p_days_soon integer default 7)
  returns table (
    event_id     uuid,
    event_title  text,
    rule_type    text,
    message      text,
    starts_at    timestamptz,
    timezone     text,
    sold         integer,
    remaining    integer,
    ticket_type  text
  )
  language plpgsql
  set search_path = ''
  as $function$
begin
  return query
  with organizer_events as (
    select e.id, e.title, e.starts_at, e.timezone
    from public.event e
    where e.organizer_id = auth.uid() and e.status = 'published'
  ),
  occurrence_bounds as (
    select
      oe.id,
      oe.title,
      oe.timezone,
      coalesce(min(eo.starts_at), oe.starts_at) as min_starts
    from organizer_events oe
    left join public.event_occurrence eo on eo.event_id = oe.id
    group by oe.id, oe.title, oe.timezone, oe.starts_at
  ),
  starting_soon as (
    select * from occurrence_bounds ob
    where ob.min_starts is not null
      and ob.min_starts > now()
      and ob.min_starts <= now() + (p_days_soon || ' days')::interval
  ),
  sold_counts as (
    select tt.event_id, count(t.id) as sold, sum(tt.quantity) as capacity
    from public.ticket_type tt
    left join public.ticket t on t.ticket_type_id = tt.id and t.status = 'active'
    where tt.event_id in (select ss.id from starting_soon ss)
    group by tt.event_id
  ),
  no_sales as (
    select
      ss.id as event_id, ss.title as event_title,
      'no_sales_yet'::text as rule_type,
      'Starts ' || to_char(ss.min_starts, 'Mon DD') || ' with no sales yet.' as message,
      ss.min_starts as starts_at,
      ss.timezone as timezone,
      0 as sold,
      null::integer as remaining,
      null::text as ticket_type
    from starting_soon ss
    left join sold_counts sc on sc.event_id = ss.id
    where coalesce(sc.sold, 0) = 0
  ),
  low_registrations as (
    select
      ss.id as event_id, ss.title as event_title,
      'low_registrations'::text as rule_type,
      'Starts ' || to_char(ss.min_starts, 'Mon DD') || ' but only ' || sc.sold || ' sold so far.' as message,
      ss.min_starts as starts_at,
      ss.timezone as timezone,
      sc.sold::integer as sold,
      null::integer as remaining,
      null::text as ticket_type
    from starting_soon ss
    join sold_counts sc on sc.event_id = ss.id
    where sc.sold > 0
      and (
        (sc.capacity is not null and sc.capacity > 0 and sc.sold::numeric / sc.capacity < 0.2)
        or (sc.capacity is null and sc.sold < 5)
      )
  ),
  nearly_sold_out as (
    select
      tt.event_id as event_id,
      oe.title as event_title,
      'nearly_sold_out'::text as rule_type,
      tt.type || ' tickets are almost sold out (' ||
        greatest(tt.quantity - coalesce(tts.sold, 0), 0) || ' left).' as message,
      null::timestamptz as starts_at,
      oe.timezone as timezone,
      coalesce(tts.sold, 0)::integer as sold,
      greatest(tt.quantity - coalesce(tts.sold, 0), 0)::integer as remaining,
      tt.type::text as ticket_type
    from public.ticket_type tt
    join organizer_events oe on oe.id = tt.event_id
    left join (
      select t2.ticket_type_id, count(*) as sold
      from public.ticket t2
      where t2.status = 'active'
      group by t2.ticket_type_id
    ) tts on tts.ticket_type_id = tt.id
    where tt.quantity is not null and tt.quantity > 0
      and (tt.quantity - coalesce(tts.sold, 0))::numeric / tt.quantity <= 0.10
      and (tt.quantity - coalesce(tts.sold, 0)) > 0
  )
  select * from no_sales
  union all
  select * from low_registrations
  union all
  select * from nearly_sold_out
  order by rule_type;
end;
$function$;

-- It answers for the signed-in organizer only (auth.uid()); nobody signed
-- out has a use for it.
revoke all on function public.get_organizer_needs_attention(integer) from public, anon;
grant execute on function public.get_organizer_needs_attention(integer) to authenticated, service_role;
