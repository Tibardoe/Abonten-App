-- "Someone reviewed your event / your place" in-app notifications.
--
-- Unlike ticket-confirmed / promotion / booking / review-reply
-- notifications (all produced by application code in @abonten/services or
-- the web actions), a new event_review / place_review row can be written
-- from two different transports:
--   * web    -> postEventReview.ts / postPlaceReview.ts server actions
--   * mobile -> a direct RLS-scoped client insert (useEventReviews.ts /
--     usePlaceReviews.ts), with no server code in the path at all
-- so the only place that reliably sees every new review is the database
-- itself. These AFTER INSERT triggers write one notification row for the
-- event organizer / place owner. They mirror the shape createNotificationCore
-- writes (type + data jsonb + image ids) so the mobile notifications screen
-- renders a thumbnail and deep-links to the owner's review-management screen.
--
-- No RLS on `notification` (unchanged, app-layer-only by design), and
-- `authenticated` already has INSERT on it, so the trigger functions run as
-- INVOKER with no new grants. `set search_path = ''` + fully-qualified
-- names satisfy the function_search_path_mutable linter. Best-effort by
-- nature: a self-review or a review whose parent row can't be found is
-- skipped, never errored, so a review insert can't fail on this.

create or replace function public.notify_event_organizer_on_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_organizer_id  uuid;
  v_title         text;
  v_flyer_id      text;
  v_flyer_version varchar(10);
begin
  select e.organizer_id, e.title, e.flyer_public_id, e.flyer_version
    into v_organizer_id, v_title, v_flyer_id, v_flyer_version
  from public.event e
  where e.id = new.event_id;

  if v_organizer_id is null or v_organizer_id = new.reviewer_id then
    return new;
  end if;

  insert into public.notification (user_id, type, title, body, link, data, image_public_id, image_version)
  values (
    v_organizer_id,
    'review_received',
    'New review',
    coalesce('Someone left a ' || new.rating || '-star review on ' || v_title || '.',
             'Someone left a new review on your event.'),
    '/manage/events/' || new.event_id,
    jsonb_build_object('kind', 'review_received', 'eventId', new.event_id, 'reviewId', new.id),
    v_flyer_id,
    v_flyer_version
  );

  return new;
end;
$$;

create or replace function public.notify_place_owner_on_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner_id      uuid;
  v_name          text;
  v_slug          text;
  v_cover_id      text;
  v_cover_version varchar(10);
begin
  select p.owner_id, p.name, p.slug, p.cover_public_id, p.cover_version
    into v_owner_id, v_name, v_slug, v_cover_id, v_cover_version
  from public.place p
  where p.id = new.place_id;

  if v_owner_id is null or v_owner_id = new.reviewer_id then
    return new;
  end if;

  insert into public.notification (user_id, type, title, body, link, data, image_public_id, image_version)
  values (
    v_owner_id,
    'review_received',
    'New review',
    coalesce('Someone left a ' || new.rating || '-star review on ' || v_name || '.',
             'Someone left a new review on your place.'),
    '/manage/places/' || new.place_id,
    jsonb_build_object('kind', 'review_received', 'placeId', new.place_id, 'placeSlug', v_slug, 'reviewId', new.id),
    v_cover_id,
    v_cover_version
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_event_organizer_on_review on public.event_review;
create trigger trg_notify_event_organizer_on_review
  after insert on public.event_review
  for each row execute function public.notify_event_organizer_on_review();

drop trigger if exists trg_notify_place_owner_on_review on public.place_review;
create trigger trg_notify_place_owner_on_review
  after insert on public.place_review
  for each row execute function public.notify_place_owner_on_review();
