// The one address of each public page. Every link the apps build and every
// share link uses the lower-case event code (/events/as3208), so the
// canonical URL, the sitemap and the structured data say the same; an
// upper-case code still opens the page, and its canonical names this one.

export function eventPath(eventCode: string): string {
  return `/events/${eventCode.toLowerCase()}`;
}

export function placePath(slug: string): string {
  return `/places/${slug}`;
}

/** A public profile opens on its posts tab. */
export function profilePath(username: string): string {
  return `/user/${username}/posts`;
}

/** A city's Explore page (market_region.slug). */
export function cityPath(slug: string): string {
  return `/explore/${slug}`;
}
