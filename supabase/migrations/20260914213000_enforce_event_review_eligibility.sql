-- Event reviews were gated only in application code.
--
-- postEventReview.ts (web) and useEventReviews.ts (mobile) both check four
-- things before inserting: the reviewer is not the organizer, the event is
-- not cancelled, it has ended, and the reviewer holds a ticket with status
-- 'used' (i.e. was scanned in at the door). They then set
-- is_verified_attendee = true, which is what renders the "Verified
-- attendee" badge.
--
-- None of that was enforced by the database. event_review_reviewer_insert
-- checks only `auth.uid() = reviewer_id`, and mobile writes reviews
-- straight to PostgREST (a class-A direct table write), so any signed-in
-- user could POST /rest/v1/event_review for ANY event and have it stored
-- approved and badged as a verified attendee. Confirmed on 2026-09-14 by
-- inserting a 1-star review, with the badge, for an event the account had
-- never bought a ticket to. Ratings drive discovery ranking and organizer
-- trust, so this was a live ratings-manipulation hole.
--
-- The rule now lives where it cannot be walked around, mirroring
-- postEventReview.ts exactly. is_verified_attendee stops being a
-- client-supplied field: the trigger sets it from what it just proved, and
-- the column default flips to false so nothing can claim the badge by
-- omission. A service_role caller (auth.uid() IS NULL) is still trusted —
-- admin tooling, moderation and data maintenance must keep working.
--
-- place_review is deliberately NOT gated: postPlaceReview.ts documents that
-- any authenticated user may review any place ("no attendance gate here").

begin;

alter table public.event_review
  alter column is_verified_attendee set default false;

create or replace function public.enforce_event_review_eligibility()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller uuid := auth.uid();
  v_organizer uuid;
  v_status text;
  v_ends timestamptz;
  v_end timestamptz;
  v_occ_count integer;
begin
  -- service_role / SQL maintenance runs without a JWT and stays trusted.
  if v_caller is null then
    return new;
  end if;

  if new.reviewer_id is distinct from v_caller then
    raise exception 'You can only post your own review'
      using errcode = '42501';
  end if;

  select e.organizer_id, e.status, e.ends_at
    into v_organizer, v_status, v_ends
  from public.event e
  where e.id = new.event_id;

  if not found then
    raise exception 'No event found!' using errcode = 'no_data_found';
  end if;

  if v_organizer = v_caller then
    raise exception 'You cannot review your own event'
      using errcode = 'check_violation';
  end if;

  if v_status = 'canceled' then
    raise exception 'This event was cancelled.'
      using errcode = 'check_violation';
  end if;

  -- Same end date resolveEventEndDate() computes: the last occurrence when
  -- the event has any, otherwise the single ends_at.
  select count(*) into v_occ_count
  from public.event_occurrence
  where event_id = new.event_id;

  if v_occ_count > 0 then
    select max(o.ends_at) into v_end
    from public.event_occurrence o
    where o.event_id = new.event_id;
  else
    v_end := v_ends;
  end if;

  if v_end is null or now() < v_end then
    raise exception 'You can only review this event after it has ended.'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1
    from public.ticket t
    join public.ticket_type tt on tt.id = t.ticket_type_id
    where t.user_id = v_caller
      and tt.event_id = new.event_id
      and t.status = 'used'
  ) then
    raise exception 'You can only review events you have attended'
      using errcode = 'check_violation';
  end if;

  -- The badge is a claim about attendance, so the database decides it
  -- rather than believing the client.
  new.is_verified_attendee := true;

  return new;
end;
$function$;

drop trigger if exists event_review_enforce_eligibility on public.event_review;

create trigger event_review_enforce_eligibility
  before insert on public.event_review
  for each row
  execute function public.enforce_event_review_eligibility();

commit;
