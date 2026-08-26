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
// Only returns events an organizer explicitly marked `featured` (which
// includes an active paid Promotion — see events/location/[location]/page.tsx,
// which folds promotion into the `featured` flag before calling this) —
// an empty result means FeaturedEventsCarousel renders nothing. There is no
// fallback to an arbitrary non-featured event: a banner badged "FEATURED"
// showing an event nobody paid to promote or opted into is misleading, so a
// location with no featured/promoted events simply gets no banner. When
// MULTIPLE events are featured, all of them are returned (for the
// carousel); the starting rotation (which event leads) still rotates daily
// via the date-seeded hash, so no single organizer's featured event always
// leads. Nothing is snapshotted: this re-filters the caller's live `events`
// array fresh on every request, so any edit an organizer makes shows up on
// the very next render with no invalidation.
export function getFeaturedEvents(
  events: UserPostType[],
  location: string,
): UserPostType[] {
  const featuredEligible = events
    .filter(meetsBaseEligibility)
    .filter((event) => event.featured);

  if (featuredEligible.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const seed = `${location.toLowerCase()}_${today}`;

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
