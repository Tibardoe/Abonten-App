import { undoSlug } from "@abonten/core/geerateSlug";

/**
 * The words to show for an Explore location slug: "accra" → "Accra",
 * "east-legon" → "East Legon". The slug the "use my current location" flow
 * puts in the URL is not a place name, so it reads as "your area".
 */
export function locationLabelFromSlug(
  slug: string,
  /** What to call the visitor's own position, in their language. */
  yourAreaLabel: string,
): string {
  let text = slug;
  try {
    text = decodeURIComponent(slug);
  } catch {
    // A malformed escape: show the slug as it came.
  }
  if (!text || text === "current-location" || text === "default-location") {
    return yourAreaLabel;
  }
  return undoSlug(text);
}
