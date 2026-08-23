// utils/dailyEventCache.ts

import type { UserPostType } from "@/types/postsType";
import { getEventStatus } from "@/utils/eventStatus";
import { getEventSoldOutStatus } from "@/utils/getEventSoldOutStatus";

/**
 * Baseline banner eligibility, independent of the `featured` flag: upcoming
 * (not ongoing, not ended — an event whose earlier sessions ended stays
 * eligible as long as at least one session hasn't started yet) and not
 * sold out.
 */
function meetsBaseEligibility(event: UserPostType): boolean {
  const status = getEventStatus(
    event.starts_at,
    event.ends_at,
    event.occurrences,
  );
  if (status !== "upcoming") return false;

  // Matches EventCard's sold-out check: get_nearby_events (the source of
  // the events passed in here) returns aggregated min_price/currency, not
  // a per-ticket-type quantity list, so only the capacity-based branch of
  // getEventSoldOutStatus is meaningful at this layer.
  const soldOut = getEventSoldOutStatus({
    capacity: event.capacity,
    attendeeCount: event.attendanceCount ?? event.attendance_count ?? 0,
  });

  return !soldOut;
}

// Picks the Featured Events banner's slides for a location without any
// stored state: which events show, and their order, is a deterministic
// function of (location, UTC date), so every instance/request agrees
// without needing to share a cache. The previous implementation cached a
// single pick on local disk (os.tmpdir()), which doesn't work across
// serverless instances (each gets its own ephemeral /tmp) or across
// replicas of the Docker deployment — different requests for the same
// location on the same day could get different "daily" events, and the
// cache silently reset on every cold start/restart anyway.
//
// Business logic is unchanged from the previous single-pick version: still
// prefers events an organizer explicitly marked `featured`, still falls
// back to picking one otherwise-eligible (upcoming, not sold out) event if
// none are featured, so a location with no self-nominated featured events
// still gets a banner. What's new is that when MULTIPLE events are
// featured, all of them are returned (for the carousel) instead of
// collapsing to one — the fallback case deliberately still returns just
// one, since a bare "Featured" banner showing arbitrary non-featured events
// would be misleading. The featured list's starting rotation (which event
// leads) still rotates daily via the same hash, so no single organizer's
// featured event always leads. Nothing is snapshotted: this re-filters the
// caller's live `events` array fresh on every request, so any edit an
// organizer makes shows up on the very next render with no invalidation.
export function getFeaturedEvents(
  events: UserPostType[],
  location: string,
): UserPostType[] {
  const eligible = events.filter(meetsBaseEligibility);

  if (!eligible.length) return [];

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const seed = `${location.toLowerCase()}_${today}`;

  const featuredEligible = eligible.filter((event) => event.featured);

  if (featuredEligible.length === 0) {
    const index = hashSeed(seed) % eligible.length;
    return [eligible[index]];
  }

  const rotation = hashSeed(seed) % featuredEligible.length;
  return [
    ...featuredEligible.slice(rotation),
    ...featuredEligible.slice(0, rotation),
  ];
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
