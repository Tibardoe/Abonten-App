// Story lifetime helpers. The database is the authority (content_post_is_public
// checks expires_at against now()); these only shape what the client shows
// and let a viewer drop a Story that expired mid-session.

export function isStoryActive(
  story: { publishedAt: string | null; expiresAt: string | null },
  now: Date = new Date(),
): boolean {
  if (!story.publishedAt || !story.expiresAt) return false;
  const published = Date.parse(story.publishedAt);
  const expires = Date.parse(story.expiresAt);
  if (Number.isNaN(published) || Number.isNaN(expires)) return false;
  return published <= now.getTime() && expires > now.getTime();
}

export function storyRemainingMs(
  expiresAt: string | null,
  now: Date = new Date(),
): number {
  if (!expiresAt) return 0;
  const expires = Date.parse(expiresAt);
  if (Number.isNaN(expires)) return 0;
  return Math.max(0, expires - now.getTime());
}

/** "3h", "42m", "now", "2d". */
export function formatStoryAge(
  publishedAt: string | null,
  now: Date = new Date(),
): string {
  if (!publishedAt) return "";
  const ageMs = now.getTime() - Date.parse(publishedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) return "now";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
