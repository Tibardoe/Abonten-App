// Readers for the JSON columns on `place`. The database types them as
// `Json`; the application stores one specific shape in each, proven here so
// the owner-facing forms receive typed values.

/** `place.social_links`: a flat map of network → URL. */
export function readSocialLinks(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, link] of Object.entries(value as Record<string, unknown>)) {
    if (typeof link === "string" && link.length > 0) out[key] = link;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export type PlaceTemporaryStatus =
  | "temporarily_closed"
  | "permanently_closed"
  | null;

/** `place.temporary_status`: free text in the schema, two known values. */
export function readPlaceTemporaryStatus(
  value: string | null | undefined,
): PlaceTemporaryStatus {
  return value === "temporarily_closed" || value === "permanently_closed"
    ? value
    : null;
}
