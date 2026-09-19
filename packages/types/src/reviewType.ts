import type { Database } from "./database.types";

// Row shapes for the review lists the web app renders. Each one is the
// table row plus exactly the embedded columns its query selects, so the
// compiler checks the PostgREST result against the list component's needs
// instead of both sides agreeing on `any`.

type Tables = Database["public"]["Tables"];

export type ReviewAuthor = {
  username: string | null;
  avatar_public_id: string | null;
  avatar_version: string | null;
};

export type ReviewPhoto = {
  id: string;
  public_id: string;
  version: string;
  position: number;
};

/** Public list on an event page: `event_review` + author + photos. */
export type EventReviewListItem = Tables["event_review"]["Row"] & {
  user_info: ReviewAuthor | null;
  event_review_photo: ReviewPhoto[];
};

/** Public list on a place page: `place_review` + author + photos. */
export type PlaceReviewListItem = Tables["place_review"]["Row"] & {
  user_info: ReviewAuthor | null;
  place_review_photo: ReviewPhoto[];
};

/** A place owner's inbox of reviews across their places. */
export type OwnedPlaceReviewListItem = Tables["place_review"]["Row"] & {
  user_info: ReviewAuthor | null;
  place: { name: string; slug: string; owner_id: string };
  place_review_photo: ReviewPhoto[];
};

/** Reviews a person wrote about events, on their profile. */
export type UserEventReviewListItem = Tables["event_review"]["Row"] & {
  event: {
    id: string;
    title: string;
    event_code: string;
    flyer_public_id: string | null;
    flyer_version: string | null;
    organizer_id: string;
  } | null;
  event_review_photo: ReviewPhoto[];
};

/** Reviews a person wrote about places, on their profile. */
export type UserPlaceReviewListItem = Tables["place_review"]["Row"] & {
  place: {
    id: string;
    name: string;
    slug: string;
    cover_public_id: string | null;
    cover_version: string | null;
    owner_id: string;
  } | null;
  place_review_photo: ReviewPhoto[];
};

/** Reviews left about an organizer (the legacy `review` table). */
export type OrganizerReviewListItem = Tables["review"]["Row"] & {
  user_info: { username: string | null } | null;
};
