-- Production gate 2026-09-25: a banned organizer could still read their
-- attendees' emails and phone numbers for up to an hour after the ban,
-- with the access token issued before it (get_event_attendee_contacts is a
-- read, so no write guard stopped it). Every other operation that reaches
-- another person was already refused in that window (tested:
-- banned-window integration suite). A restricted account now gets no
-- attendee contact details.

create or replace function public.get_event_attendee_contacts(p_event_id uuid)
returns table(user_id uuid, email text, phone text)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if public.account_is_restricted() then
    raise exception 'Your account has been restricted.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.event e
    where e.id = p_event_id and e.organizer_id = auth.uid()
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
