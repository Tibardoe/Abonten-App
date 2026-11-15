-- Team accounts, stage 2: running events and places as a team (Tickets,
-- entry and teams plan, Part 2; docs/architecture/team-accounts.md).
--
-- A member of an active team acts for it on its events and places, within
-- what their role covers:
--   Manager            events, ticket types, dates, media, promo codes, the
--                      attendee list, check-in, places, photos, services,
--                      hours, bookings
--   Door staff         check-in only: a ticket's code and status, never names
--   Front desk         a place's bookings and its visit QR
--   Owner              all of these (money stays out until stage 3)
--
-- public.acting_accounts(caps) is the signed-in person's own id plus every
-- active team they are an active member of in a role that covers one of the
-- capabilities. It is evaluated once per statement (wrapped in a SELECT), so
-- a list of events or places never calls it per row. Every access rule that
-- keyed on "the owner is the signed-in person" now keys on "the owner is one
-- of the accounts the signed-in person acts for": a person acting for
-- themselves is unchanged.
--
-- Nothing here is reachable until a team exists, and teams ship switched
-- off (team_program_setting).

-- ---------------------------------------------------------------------------
-- 1. The accounts the signed-in person acts for
-- ---------------------------------------------------------------------------

create or replace function public.acting_accounts(p_caps text[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then '{}'::uuid[] else
    array[auth.uid()] || coalesce((
      select array_agg(distinct m.team_id)
      from public.team_member m
      join public.team t on t.account_id = m.team_id
      where m.user_id = auth.uid()
        and m.status = 'active'
        and t.status = 'active'
        and exists (
          select 1 from unnest(p_caps) c where public.team_role_can(m.role, c)
        )
    ), '{}'::uuid[])
  end;
$$;

-- Signed-out visitors read public events and places through the same rules,
-- so anon may call it too: with nobody signed in it answers an empty list.
revoke all on function public.acting_accounts(text[]) from public;
grant execute on function public.acting_accounts(text[]) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Access rules on events and places
-- ---------------------------------------------------------------------------

drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance
  as permissive for select to public
  using (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = attendance.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['attendees.view']))::uuid[])))))));

drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance
  as permissive for update to public
  using (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = attendance.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['attendees.view']))::uuid[])))))))
  with check (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = attendance.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['attendees.view']))::uuid[])))))));

drop policy if exists event_organizer_delete on public.event;
create policy event_organizer_delete on public.event
  as permissive for delete to public
  using ((organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage']))::uuid[])));

drop policy if exists event_organizer_insert on public.event;
create policy event_organizer_insert on public.event
  as permissive for insert to public
  with check ((organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage']))::uuid[])));

drop policy if exists event_organizer_update on public.event;
create policy event_organizer_update on public.event
  as permissive for update to public
  using ((organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage']))::uuid[])))
  with check ((organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage']))::uuid[])));

drop policy if exists event_select on public.event;
create policy event_select on public.event
  as permissive for select to public
  using (((organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage', 'attendees.view', 'checkin.scan']))::uuid[])) OR (((status)::text = ANY (ARRAY['published'::text, 'canceled'::text])) AND (moderation_state IS DISTINCT FROM 'hidden'::text) AND (moderation_state IS DISTINCT FROM 'removed'::text))));

drop policy if exists event_analytics_event_organizer_select on public.event_analytics_event;
create policy event_analytics_event_organizer_select on public.event_analytics_event
  as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = event_analytics_event.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['money.view']))::uuid[]))))));

drop policy if exists event_media_organizer_all on public.event_media;
create policy event_media_organizer_all on public.event_media
  as permissive for all to public
  using ((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = event_media.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage']))::uuid[]))))))
  with check ((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = event_media.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage']))::uuid[]))))));

drop policy if exists event_occurrence_organizer_delete on public.event_occurrence;
create policy event_occurrence_organizer_delete on public.event_occurrence
  as permissive for delete to public
  using ((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = event_occurrence.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage']))::uuid[]))))));

drop policy if exists event_occurrence_organizer_insert on public.event_occurrence;
create policy event_occurrence_organizer_insert on public.event_occurrence
  as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = event_occurrence.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage']))::uuid[]))))));

drop policy if exists event_occurrence_organizer_update on public.event_occurrence;
create policy event_occurrence_organizer_update on public.event_occurrence
  as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = event_occurrence.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage']))::uuid[]))))))
  with check ((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = event_occurrence.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage']))::uuid[]))))));

drop policy if exists event_occurrence_select on public.event_occurrence;
create policy event_occurrence_select on public.event_occurrence
  as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = event_occurrence.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage', 'attendees.view', 'checkin.scan']))::uuid[]))))) OR (EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = event_occurrence.event_id) AND ((e.status)::text = ANY (ARRAY['published'::text, 'canceled'::text])))))));

drop policy if exists place_owner_delete on public.place;
create policy place_owner_delete on public.place
  as permissive for delete to public
  using ((owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[])));

drop policy if exists place_owner_insert on public.place;
create policy place_owner_insert on public.place
  as permissive for insert to public
  with check ((owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[])));

drop policy if exists place_select on public.place;
create policy place_select on public.place
  as permissive for select to public
  using (((owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage', 'bookings.manage', 'visit.show']))::uuid[])) OR ((status = 'published'::text) AND (moderation_state IS DISTINCT FROM 'hidden'::text) AND (moderation_state IS DISTINCT FROM 'removed'::text))));

drop policy if exists place_update on public.place;
create policy place_update on public.place
  as permissive for update to authenticated
  using ((owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[])))
  with check ((owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[])));

drop policy if exists place_analytics_event_owner_select on public.place_analytics_event;
create policy place_analytics_event_owner_select on public.place_analytics_event
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_analytics_event.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[]))))));

drop policy if exists place_booking_select on public.place_booking;
create policy place_booking_select on public.place_booking
  as permissive for select to public
  using (((( SELECT auth.uid() AS uid) = customer_id) OR (EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_booking.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['bookings.manage']))::uuid[])))))));

drop policy if exists place_booking_update on public.place_booking;
create policy place_booking_update on public.place_booking
  as permissive for update to public
  using (((( SELECT auth.uid() AS uid) = customer_id) OR (EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_booking.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['bookings.manage']))::uuid[])))))))
  with check (((( SELECT auth.uid() AS uid) = customer_id) OR (EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_booking.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['bookings.manage']))::uuid[])))))));

drop policy if exists place_opening_hours_owner_delete on public.place_opening_hours;
create policy place_opening_hours_owner_delete on public.place_opening_hours
  as permissive for delete to public
  using ((EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_opening_hours.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[]))))));

drop policy if exists place_opening_hours_owner_insert on public.place_opening_hours;
create policy place_opening_hours_owner_insert on public.place_opening_hours
  as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_opening_hours.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[]))))));

drop policy if exists place_opening_hours_owner_update on public.place_opening_hours;
create policy place_opening_hours_owner_update on public.place_opening_hours
  as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_opening_hours.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[]))))))
  with check ((EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_opening_hours.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[]))))));

drop policy if exists place_opening_hours_select on public.place_opening_hours;
create policy place_opening_hours_select on public.place_opening_hours
  as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_opening_hours.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage', 'bookings.manage', 'visit.show']))::uuid[]))))) OR (EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_opening_hours.place_id) AND (p.status = 'published'::text))))));

drop policy if exists place_photo_owner_delete on public.place_photo;
create policy place_photo_owner_delete on public.place_photo
  as permissive for delete to public
  using ((EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_photo.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[]))))));

drop policy if exists place_photo_owner_insert on public.place_photo;
create policy place_photo_owner_insert on public.place_photo
  as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_photo.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[]))))));

drop policy if exists place_photo_owner_update on public.place_photo;
create policy place_photo_owner_update on public.place_photo
  as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_photo.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[]))))))
  with check ((EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_photo.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[]))))));

drop policy if exists place_photo_select on public.place_photo;
create policy place_photo_select on public.place_photo
  as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_photo.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage', 'bookings.manage', 'visit.show']))::uuid[]))))) OR (EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_photo.place_id) AND (p.status = 'published'::text))))));

drop policy if exists place_service_owner_delete on public.place_service;
create policy place_service_owner_delete on public.place_service
  as permissive for delete to public
  using ((EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_service.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[]))))));

drop policy if exists place_service_owner_insert on public.place_service;
create policy place_service_owner_insert on public.place_service
  as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_service.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[]))))));

drop policy if exists place_service_owner_update on public.place_service;
create policy place_service_owner_update on public.place_service
  as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_service.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[]))))))
  with check ((EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_service.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage']))::uuid[]))))));

drop policy if exists place_service_select on public.place_service;
create policy place_service_select on public.place_service
  as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_service.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['places.manage', 'bookings.manage', 'visit.show']))::uuid[]))))) OR (EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_service.place_id) AND (p.status = 'published'::text))))));

drop policy if exists promo_code_organizer_delete on public.promo_code;
create policy promo_code_organizer_delete on public.promo_code
  as permissive for delete to public
  using ((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = promo_code.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['promo.manage']))::uuid[]))))));

drop policy if exists promo_code_organizer_insert on public.promo_code;
create policy promo_code_organizer_insert on public.promo_code
  as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = promo_code.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['promo.manage']))::uuid[]))))));

drop policy if exists promo_code_organizer_update on public.promo_code;
create policy promo_code_organizer_update on public.promo_code
  as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = promo_code.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['promo.manage']))::uuid[]))))))
  with check ((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = promo_code.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['promo.manage']))::uuid[]))))));

drop policy if exists promo_code_select on public.promo_code;
create policy promo_code_select on public.promo_code
  as permissive for select to authenticated
  using (((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = promo_code.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['promo.manage', 'events.manage']))::uuid[]))))) OR ( SELECT admin_has_permission('events.view'::text) AS admin_has_permission)));

drop policy if exists promo_code_usage_select on public.promo_code_usage;
create policy promo_code_usage_select on public.promo_code_usage
  as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = promo_code_usage.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['promo.manage', 'money.view']))::uuid[]))))) OR (( SELECT auth.uid() AS uid) = user_id)));

drop policy if exists ticket_organizer_update on public.ticket;
create policy ticket_organizer_update on public.ticket
  as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM (ticket_type tt
     JOIN event e ON ((e.id = tt.event_id)))
  WHERE ((tt.id = ticket.ticket_type_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['checkin.scan']))::uuid[]))))))
  with check ((EXISTS ( SELECT 1
   FROM (ticket_type tt
     JOIN event e ON ((e.id = tt.event_id)))
  WHERE ((tt.id = ticket.ticket_type_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['checkin.scan']))::uuid[]))))));

drop policy if exists ticket_select on public.ticket;
create policy ticket_select on public.ticket
  as permissive for select to public
  using (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM (ticket_type tt
     JOIN event e ON ((e.id = tt.event_id)))
  WHERE ((tt.id = ticket.ticket_type_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['attendees.view', 'checkin.scan']))::uuid[])))))));

drop policy if exists ticket_type_organizer_delete on public.ticket_type;
create policy ticket_type_organizer_delete on public.ticket_type
  as permissive for delete to public
  using ((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = ticket_type.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage']))::uuid[]))))));

drop policy if exists ticket_type_organizer_insert on public.ticket_type;
create policy ticket_type_organizer_insert on public.ticket_type
  as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = ticket_type.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage']))::uuid[]))))));

drop policy if exists ticket_type_organizer_update on public.ticket_type;
create policy ticket_type_organizer_update on public.ticket_type
  as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = ticket_type.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage']))::uuid[]))))))
  with check ((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = ticket_type.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage']))::uuid[]))))));

drop policy if exists ticket_type_select on public.ticket_type;
create policy ticket_type_select on public.ticket_type
  as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = ticket_type.event_id) AND (e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['events.manage', 'attendees.view', 'checkin.scan', 'promo.manage']))::uuid[]))))) OR (EXISTS ( SELECT 1
   FROM event e
  WHERE ((e.id = ticket_type.event_id) AND ((e.status)::text = ANY (ARRAY['published'::text, 'canceled'::text])))))));


-- ---------------------------------------------------------------------------
-- 3. Guards and functions that compared the owner with the signed-in person
-- ---------------------------------------------------------------------------

-- A promo code's terms change only by someone who manages its event's codes.
create or replace function public.protect_promo_code_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1 from public.event e
    where e.id = new.event_id
      and e.organizer_id = any ((select public.acting_accounts(array['promo.manage']))::uuid[])
  ) then
    return new;
  end if;

  if new.event_id is distinct from old.event_id
     or new.promo_code is distinct from old.promo_code
     or new.discount_percentage is distinct from old.discount_percentage
     or new.expires_at is distinct from old.expires_at
     or new.max_uses is distinct from old.max_uses
     or new.is_active is distinct from old.is_active
     or new.created_at is distinct from old.created_at then
    raise exception 'Not authorized to modify this promo code';
  end if;

  return new;
end;
$function$;

-- A booking request is answered by whoever handles the place's bookings.
create or replace function public.guard_place_booking_client_write()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending' then
      raise exception 'A booking starts as a request' using errcode = '42501';
    end if;
    return new;
  end if;

  if to_jsonb(new) - array['updated_at'] = to_jsonb(old) - array['updated_at'] then
    return new;
  end if;
  if (to_jsonb(new) - array['status', 'updated_at'])
     is distinct from (to_jsonb(old) - array['status', 'updated_at']) then
    raise exception 'Only a booking''s status can change' using errcode = '42501';
  end if;

  select owner_id into v_owner from public.place where id = new.place_id;

  if v_uid = old.customer_id
     and old.status in ('pending', 'accepted') and new.status = 'cancelled' then
    return new;
  end if;
  if v_owner = any (public.acting_accounts(array['bookings.manage']))
     and old.status = 'pending' and new.status in ('accepted', 'declined') then
    return new;
  end if;

  raise exception 'That booking change is not allowed' using errcode = '42501';
end;
$function$;

-- The attendee contacts behind "message attendees": the attendee list's
-- capability.
create or replace function public.get_event_attendee_contacts(p_event_id uuid)
returns table(user_id uuid, email text, phone text)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if public.account_is_restricted() then
    raise exception 'Your account has been restricted.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.event e
    where e.id = p_event_id
      and e.organizer_id = any (public.acting_accounts(array['attendees.view']))
  ) then
    raise exception 'Not authorized to view attendees for this event';
  end if;

  return query
  select distinct u.id, u.email::text, u.phone::text
  from public.attendance a
  join auth.users u on u.id = a.user_id
  where a.event_id = p_event_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('event', 'event_occurrence', 'event_media', 'ticket_type',
        'promo_code', 'promo_code_usage', 'attendance', 'ticket',
        'event_analytics_event', 'place', 'place_photo', 'place_service',
        'place_opening_hours', 'place_booking', 'place_analytics_event')
      and (coalesce(qual, '') ~ '(organizer_id|owner_id) = \( SELECT auth\.uid\(\)'
        or coalesce(with_check, '') ~ '(organizer_id|owner_id) = \( SELECT auth\.uid\(\)'
        or coalesce(qual, '') ~ 'auth\.uid\(\) AS uid\) = (organizer_id|owner_id)'
        or coalesce(with_check, '') ~ 'auth\.uid\(\) AS uid\) = (organizer_id|owner_id)')
  ) then
    raise exception 'migration check: an events or places rule still keys on the owner alone';
  end if;
  if cardinality(public.acting_accounts(array['events.manage'])) <> 0 then
    raise exception 'migration check: acting_accounts must be empty with nobody signed in';
  end if;
end;
$$;
