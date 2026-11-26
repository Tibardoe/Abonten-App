// What a place page offers about claiming the place, on the website and in
// the app (2026-11-26). One rule for both:
//
//   * the viewer runs the place (its owner, or a member of the team that
//     owns it): nothing about claiming;
//   * the viewer's own request is waiting: "Claim pending review";
//   * nobody real is behind the place (its owner's account was deleted, or
//     Abonten listed it and nobody has claimed it yet): a prominent
//     "Claim this place";
//   * someone runs it (claimed, or listed by its owner; Verified or not):
//     no claim button, only a quiet "I own this business" in the place's
//     menu, which opens the same form worded as an ownership dispute.
//
// The database keeps the same definitions: public.place_listed_by_abonten()
// and public.place_claim_situation() (migration 20261126140000), which the
// Admin › Claims list and the guard on new requests use. Change them
// together.

import { DELETED_ACCOUNT_STATUS } from "./placeOwner";

/**
 * After staff turn down someone's request for a place another account
 * runs, that person may ask again for the same place only this many days
 * later. Mirrors the interval in public.place_claim_request_guard().
 */
export const DISPUTE_RETRY_DAYS = 30;

/**
 * The owner's account as a place read embeds it: whether it was deleted,
 * and whether it is one of Abonten's own staff (user_info.is_admin, kept
 * in step with an active admin_user row). Absent in an older cached copy.
 * PLACE_OWNER_EMBED (./placeOwner) reads both.
 */
export type PlaceClaimOwnerRef =
  | { status_id?: number | null; is_admin?: boolean | null }
  | null
  | undefined;

export type PlaceClaimSubject = {
  ownerId: string | null | undefined;
  /** place.claimed; unknown (an older cached copy) reads as claimed. */
  claimed: boolean | null | undefined;
  owner: PlaceClaimOwnerRef;
};

/** Who is behind a place, as far as claiming it goes. */
export type PlaceStewardship =
  /** Someone runs it: claimed, or listed by its owner. */
  | "owner"
  /** Its owner's account was deleted. */
  | "owner_deleted"
  /** Abonten's own staff put it up and nobody has claimed it. */
  | "listed_by_abonten";

/**
 * Whether anyone real is behind the place. Anything the read did not say
 * counts as an owner: the page never invites a claim on a guess.
 */
export function placeStewardship(place: PlaceClaimSubject): PlaceStewardship {
  if (place.owner?.status_id === DELETED_ACCOUNT_STATUS) {
    return "owner_deleted";
  }
  if (place.claimed === false && place.owner?.is_admin === true) {
    return "listed_by_abonten";
  }
  return "owner";
}

export type ViewerClaimStatus = "none" | "pending" | "approved" | "rejected";

/** The viewer's most recent request for this place (their own rows). */
export type ViewerClaim = {
  status: ViewerClaimStatus;
  /** When staff decided it; set for approved and rejected requests. */
  reviewedAt?: string | null;
};

export type PlaceClaimViewer =
  | { signedIn: false }
  | {
      signedIn: true;
      userId: string;
      /** The teams the person is a member of; null until known. */
      teamIds: readonly string[] | null;
      /** Their latest request for this place; undefined until known. */
      claim: ViewerClaim | undefined;
    };

export type PlaceClaimInvite =
  /** Nothing about claiming (the viewer runs it, or it is not known yet). */
  | { kind: "none" }
  /** The viewer's request is waiting for staff. */
  | { kind: "pending" }
  /** Nobody is behind the place: the prominent "Claim this place". */
  | { kind: "claim"; reason: "owner_deleted" | "listed_by_abonten" }
  /**
   * Someone runs it: the quiet "I own this business". `retryAfter` is set
   * while a turned-down request keeps the viewer from asking again.
   */
  | { kind: "dispute"; retryAfter: Date | null };

const DAY_MS = 86_400_000;

/**
 * When the viewer may ask again for a place someone runs, or null when
 * they may ask now: DISPUTE_RETRY_DAYS after staff turned down their
 * latest request for it.
 */
export function disputeRetryAfter(
  claim: ViewerClaim | undefined,
  now: Date = new Date(),
): Date | null {
  if (claim?.status !== "rejected" || !claim.reviewedAt) return null;
  const reviewed = new Date(claim.reviewedAt).getTime();
  if (Number.isNaN(reviewed)) return null;
  const retry = reviewed + DISPUTE_RETRY_DAYS * DAY_MS;
  return retry > now.getTime() ? new Date(retry) : null;
}

/** What the place page shows this viewer about claiming the place. */
export function placeClaimInvite(
  place: PlaceClaimSubject,
  viewer: PlaceClaimViewer,
  now: Date = new Date(),
): PlaceClaimInvite {
  const stewardship = placeStewardship(place);

  // Signed out: the entry is shown, and choosing it signs in first.
  if (!viewer.signedIn) {
    return stewardship === "owner"
      ? { kind: "dispute", retryAfter: null }
      : { kind: "claim", reason: stewardship };
  }

  const ownerId = place.ownerId ?? null;
  if (ownerId && viewer.userId === ownerId) return { kind: "none" };
  if (ownerId && viewer.teamIds?.includes(ownerId)) return { kind: "none" };

  // Until the viewer's own request is known, offer nothing rather than a
  // button that turns into "pending" a moment later.
  if (viewer.claim === undefined) return { kind: "none" };
  if (viewer.claim.status === "pending") return { kind: "pending" };

  if (stewardship !== "owner") return { kind: "claim", reason: stewardship };

  // A member of the owning team is told nothing about claiming it; until
  // the teams are known, the menu waits too.
  if (viewer.teamIds === null) return { kind: "none" };
  return { kind: "dispute", retryAfter: disputeRetryAfter(viewer.claim, now) };
}

/**
 * Why the database refused a new request (public.place_claim_request_guard
 * and the one-pending-request index), from the error a Data API insert or
 * a service call returns.
 *   - "pending": the person already has a request for it waiting;
 *   - "runs_place": they own it or are in the team that owns it;
 *   - "dispute_wait": staff turned their last request down too recently.
 */
export type PlaceClaimRefusal = "pending" | "runs_place" | "dispute_wait";

export const PLACE_CLAIM_GUARD_MESSAGES = {
  runs_place: "place_claim:runs_place",
  dispute_wait: "place_claim:dispute_wait",
} as const;

export function placeClaimRefusal(
  error: { code?: string | null; message?: string | null } | null | undefined,
): PlaceClaimRefusal | null {
  if (!error) return null;
  if (error.code === "23505") return "pending";
  const message = error.message ?? "";
  if (message.includes(PLACE_CLAIM_GUARD_MESSAGES.runs_place)) {
    return "runs_place";
  }
  if (message.includes(PLACE_CLAIM_GUARD_MESSAGES.dispute_wait)) {
    return "dispute_wait";
  }
  return null;
}

/**
 * The shortest explanation a request for a place someone runs must carry
 * (the form asks for it; the website's action checks it again).
 */
export const DISPUTE_NOTE_MIN_LENGTH = 10;
