-- Event Review Lifecycle.
--
-- Context: event_review (added in 20260828090000_add_event_reviews_and_review_photos.sql)
-- already gates on attendance, but "attendance" there just means a non-cancelled
-- attendance row -- i.e. a purchase or free RSVP, not proof anyone actually
-- showed up. Reviews are now gated (in postEventReview.ts /
-- getEventReviewEligibility.ts) on a *checked-in* ticket instead
-- (ticket.status = 'used', set by the new checkInTicket.ts action), plus the
-- event having actually ended. This migration only adds the one column the
-- UI needs to render that state -- the check-in signal itself reuses the
-- existing, previously-unused ticket.status/used_at columns, no schema
-- change needed for that part.

-- is_verified_attendee: snapshot at review-creation time. Every review
-- created from now on requires a checked-in ticket, so this is always true
-- for new rows -- the column exists so the UI has something to render the
-- "Verified Attendee" badge from, and so a future policy allowing
-- unverified reviews has somewhere to record that. Pre-existing rows
-- default to true since they predate any gate and can't be retroactively
-- verified one way or the other; defaulting them to false would mislabel
-- reviewers who really did attend.
ALTER TABLE public.event_review
  ADD COLUMN is_verified_attendee boolean NOT NULL DEFAULT true;

-- get_similar_events (src/actions/getSimilarEvents.ts) already excludes
-- events whose last occurrence has ended (added in
-- 20260816100000_add_event_featured_and_fix_status_rpcs.sql) but, unlike
-- get_nearby_events/get_filtered_events, never filters on e.status --
-- a draft or cancelled event whose dates haven't passed can still surface
-- as a "similar event". Same signature, so CREATE OR REPLACE is enough
-- (no DROP needed).
CREATE OR REPLACE FUNCTION public.get_similar_events (
  input_category  text,
  input_location  extensions.geography,
  input_radius_km numeric
)
  RETURNS TABLE (
    id                   uuid,
    organizer_id         uuid,
    event_category       text,
    event_type           text,
    title                text,
    slug                 text,
    description          text,
    location             extensions.geography,
    address              jsonb,
    website_url          text,
    capacity             integer,
    flyer_public_id      text,
    flyer_version        character varying,
    starts_at            timestamp with time zone,
    ends_at              timestamp with time zone,
    status               character varying,
    created_at           timestamp with time zone,
    event_code           text,
    require_registration boolean,
    ticket_price         numeric,
    ticket_currency      text,
    occurrences          json
  )
  LANGUAGE plpgsql
  STABLE
  AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.organizer_id,
    e.event_category,
    e.event_type,
    e.title,
    e.slug,
    e.description,
    e.location,
    e.address,
    e.website_url,
    e.capacity,
    e.flyer_public_id,
    e.flyer_version,
    e.starts_at,
    e.ends_at,
    e.status,
    e.created_at,
    e.event_code,
    e.require_registration,
    tt.price,
    tt.currency,
    occ_data.occurrences
  FROM event e
  LEFT JOIN LATERAL (
    SELECT price, currency
    FROM ticket_type
    WHERE ticket_type.event_id = e.id
    ORDER BY price ASC
    LIMIT 1
  ) tt ON true
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN COUNT(*) > 0 THEN
          json_agg(
            json_build_object(
              'id', occ.id,
              'starts_at', occ.starts_at,
              'ends_at', occ.ends_at
            )
            ORDER BY occ.starts_at ASC
          )
        ELSE
          json_build_array(
            json_build_object(
              'id', NULL,
              'starts_at', e.starts_at,
              'ends_at', e.ends_at
            )
          )
      END AS occurrences
    FROM event_occurrence occ
    WHERE occ.event_id = e.id
  ) occ_data ON true
  WHERE e.status = 'published'
    AND lower(e.event_category) = lower(input_category)
    AND ST_DWithin(
      e.location::geography,
      input_location,
      input_radius_km * 1000 -- km to meters
    )
    AND (
      EXISTS (
        SELECT 1 FROM event_occurrence o
        WHERE o.event_id = e.id AND o.ends_at > now()
      )
      OR (
        NOT EXISTS (SELECT 1 FROM event_occurrence o WHERE o.event_id = e.id)
        AND (e.ends_at > now() OR (e.ends_at IS NULL AND e.starts_at > now()))
      )
    );
END;
$function$;

GRANT ALL ON FUNCTION public.get_similar_events(text, extensions.geography, numeric) TO anon;
GRANT ALL ON FUNCTION public.get_similar_events(text, extensions.geography, numeric) TO authenticated;
GRANT ALL ON FUNCTION public.get_similar_events(text, extensions.geography, numeric) TO service_role;
