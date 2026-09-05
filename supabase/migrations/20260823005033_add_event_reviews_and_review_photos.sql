-- Event Reviews + Review Photos.
--
-- Context: place_review already lets a place owner post one reply
-- (owner_response/owner_response_at) to a review of their place. Event
-- reviews did not exist at all before this migration -- the only
-- review-of-an-organizer feature was the pre-existing generic `review`
-- table (person-to-person: attendee reviews an organizer across all of
-- their events, gated by attendance, with no reply column). That table is
-- deliberately left untouched here; event_review is a new, separate table
-- for reviewing one specific event, following the exact same reasoning
-- place_review's own migration recorded for not reusing `review`:
-- polymorphism would mean unpicking postReview.ts's attendance gate and its
-- reviewed_id -> user_info FK. UNIQUE(event_id, reviewer_id) enforces "one
-- review per user per event" at the database level, same as place_review.
--
-- Column naming deliberately diverges from place_review in one place:
-- organizer_response/organizer_response_at (not owner_response) since an
-- event has an organizer, not an "owner" -- there is no existing consumer
-- of place_review's naming this could conflict with.
--
-- Photos: place_review and event_review each get their own *_review_photo
-- table (place_review_photo / event_review_photo), following place_photo's
-- existing shape (public_id/version/position + the same public_id format
-- check) rather than one polymorphic review_photo table with a
-- review_type discriminator -- consistent with this schema's established
-- preference (see this file's own precedent in
-- 20260820090000_add_places_feature.sql) for a dedicated FK+CASCADE per
-- content type over a polymorphic association. No RLS, no partitioning,
-- same rationale as every other table in this schema.

CREATE TABLE public.event_review (
  id                     uuid    DEFAULT extensions.uuid_generate_v4() NOT NULL,
  event_id               uuid    NOT NULL,
  reviewer_id            uuid    NOT NULL,
  rating                 smallint NOT NULL,
  title                  text,
  comment                text,
  status                 text    DEFAULT 'approved' NOT NULL,
  organizer_response     text,
  organizer_response_at  timestamp with time zone,
  created_at             timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.event_review ADD CONSTRAINT event_review_pkey PRIMARY KEY (id);
ALTER TABLE public.event_review ADD CONSTRAINT event_review_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;
ALTER TABLE public.event_review ADD CONSTRAINT event_review_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.user_info(id) ON DELETE CASCADE;
ALTER TABLE public.event_review ADD CONSTRAINT event_review_rating_check CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE public.event_review ADD CONSTRAINT event_review_comment_check CHECK (comment IS NULL OR length(comment) <= 500);
ALTER TABLE public.event_review ADD CONSTRAINT event_review_status_check
  CHECK (status = ANY (ARRAY['pending', 'approved', 'rejected']));
ALTER TABLE public.event_review ADD CONSTRAINT event_review_unique_reviewer UNIQUE (event_id, reviewer_id);

GRANT ALL ON public.event_review TO anon;
GRANT ALL ON public.event_review TO authenticated;
GRANT ALL ON public.event_review TO service_role;

CREATE INDEX idx_event_review_event_id ON public.event_review (event_id, created_at);

CREATE TABLE public.place_review_photo (
  id               uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  place_review_id  uuid                     NOT NULL,
  public_id        text                     NOT NULL,
  version          character varying(10)    NOT NULL,
  position         integer                  DEFAULT 0 NOT NULL,
  created_at       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.place_review_photo ADD CONSTRAINT place_review_photo_pkey PRIMARY KEY (id);
ALTER TABLE public.place_review_photo ADD CONSTRAINT place_review_photo_review_id_fkey FOREIGN KEY (place_review_id) REFERENCES public.place_review(id) ON DELETE CASCADE;
ALTER TABLE public.place_review_photo ADD CONSTRAINT place_review_photo_public_id_check CHECK (public_id ~* '^[a-z0-9_/-]+$'::text);

GRANT ALL ON public.place_review_photo TO anon;
GRANT ALL ON public.place_review_photo TO authenticated;
GRANT ALL ON public.place_review_photo TO service_role;

CREATE INDEX idx_place_review_photo_review_id ON public.place_review_photo (place_review_id, position);

CREATE TABLE public.event_review_photo (
  id               uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  event_review_id  uuid                     NOT NULL,
  public_id        text                     NOT NULL,
  version          character varying(10)    NOT NULL,
  position         integer                  DEFAULT 0 NOT NULL,
  created_at       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.event_review_photo ADD CONSTRAINT event_review_photo_pkey PRIMARY KEY (id);
ALTER TABLE public.event_review_photo ADD CONSTRAINT event_review_photo_review_id_fkey FOREIGN KEY (event_review_id) REFERENCES public.event_review(id) ON DELETE CASCADE;
ALTER TABLE public.event_review_photo ADD CONSTRAINT event_review_photo_public_id_check CHECK (public_id ~* '^[a-z0-9_/-]+$'::text);

GRANT ALL ON public.event_review_photo TO anon;
GRANT ALL ON public.event_review_photo TO authenticated;
GRANT ALL ON public.event_review_photo TO service_role;

CREATE INDEX idx_event_review_photo_review_id ON public.event_review_photo (event_review_id, position);
