-- Hard length backstop for review responses.
--
-- The organizer/owner reply columns (event_review.organizer_response,
-- place_review.owner_response) never had a length CHECK, unlike the
-- reviewer-authored `comment` column (<= 500). The service layer
-- (@abonten/services/reviews/reviewResponseCore) now trims + rejects an
-- empty response and caps it at 500, but the mobile organizer event-reviews
-- screen writes `organizer_response` straight through RLS (class-A CRUD, no
-- service hop), so a DB-level cap is the only guard that path can't skip.
-- Set generously above the app cap so a future copy-tweak doesn't trip it.
--
-- Existing data checked before adding: 0 event responses, 1 place response
-- (length 10).

alter table public.event_review
  add constraint event_review_organizer_response_len
  check (organizer_response is null or length(organizer_response) <= 1000);

alter table public.place_review
  add constraint place_review_owner_response_len
  check (owner_response is null or length(owner_response) <= 1000);
