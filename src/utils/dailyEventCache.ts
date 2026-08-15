// utils/dailyEventCache.ts

import type { UserPostType } from "@/types/postsType";

// Picks a stable "event of the day" per location without any stored state:
// the pick is a deterministic function of (location, UTC date), so every
// instance/request agrees without needing to share a cache. The previous
// implementation cached this on local disk (os.tmpdir()), which doesn't
// work across serverless instances (each gets its own ephemeral /tmp) or
// across replicas of the Docker deployment — different requests for the
// same location on the same day could get different "daily" events, and
// the cache silently reset on every cold start/restart anyway.
export function getDailyEvent(
  events: UserPostType[],
  location: string,
): UserPostType | null {
  if (!events.length) return null;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const seed = `${location.toLowerCase()}_${today}`;
  const index = hashSeed(seed) % events.length;

  return events[index];
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
