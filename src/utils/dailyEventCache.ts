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

// Picks a stable "event of the day" per location without any stored state:
// the pick is a deterministic function of (location, UTC date), so every
// instance/request agrees without needing to share a cache. The previous
// implementation cached this on local disk (os.tmpdir()), which doesn't
// work across serverless instances (each gets its own ephemeral /tmp) or
// across replicas of the Docker deployment — different requests for the
// same location on the same day could get different "daily" events, and
// the cache silently reset on every cold start/restart anyway.
//
// Prefers events an organizer explicitly marked `featured`. If none in this
// location/fetch qualify, falls back to picking among all otherwise-eligible
// (upcoming, not sold out) events instead of showing nothing — a location
// with no self-nominated featured events still gets a banner. Either way,
// nothing is snapshotted: the pick is an index into the caller's live
// `events` array, re-resolved fresh on every request, so any edit an
// organizer makes to the picked event (featured or fallback) shows up on
// the very next banner render with no separate invalidation step needed.
export function getDailyEvent(
  events: UserPostType[],
  location: string,
): UserPostType | null {
  const eligible = events.filter(meetsBaseEligibility);

  if (!eligible.length) return null;

  const featuredEligible = eligible.filter((event) => event.featured);
  const pool = featuredEligible.length > 0 ? featuredEligible : eligible;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const seed = `${location.toLowerCase()}_${today}`;
  const index = hashSeed(seed) % pool.length;

  return pool[index];
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
