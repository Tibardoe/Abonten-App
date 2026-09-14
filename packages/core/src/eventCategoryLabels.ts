// Turning a category slug in a URL back into the exact label the database
// stores.
//
// `generateSlug` is lossy by design: it strips every character that is not a
// word character, whitespace or a hyphen. `undoSlug` cannot put those back,
// so a slug round-trip silently rewrites the label:
//
//     "Music & Concerts"  ->  "music-concerts"  ->  "Music Concerts"
//
// That matters because the round-tripped string is not just a heading — the
// "See all similar events" page passes it straight into `get_similar_events`,
// which filters on `lower(event_category) = lower(input_category)`. A label
// the round-trip mangled matches nothing, so the page comes back empty.
// 18 of the 19 top-level categories contain an "&" or a comma, so this was
// almost every category, not an edge case.
//
// The fix is to stop guessing the label from the slug and look it up instead.
// `eventCategoriesAndTypes` is the canonical list the event form writes from,
// so slugging each known label once gives an exact reverse index. Anything
// not in that index (a free-text search term, a place name, a legacy
// category) falls back to `undoSlug`, which is the right answer there.

import { eventCategoriesAndTypes } from "./eventCategoriesAndTypes";
import { generateSlug, undoSlug } from "./geerateSlug";

function buildIndex(): ReadonlyMap<string, string> {
  const index = new Map<string, string>();

  const remember = (label: string) => {
    const slug = generateSlug(label);
    // First write wins: categories are added before types, so a slug shared
    // by a category and one of its types resolves to the category — which is
    // the column `get_similar_events` filters on.
    if (slug.length > 0 && !index.has(slug)) index.set(slug, label);
  };

  for (const group of eventCategoriesAndTypes) remember(group.category);
  for (const group of eventCategoriesAndTypes)
    for (const type of group.types) remember(type);

  return index;
}

const SLUG_TO_LABEL = buildIndex();

/**
 * Resolves a URL slug back to the canonical event category or type label.
 * Falls back to `undoSlug` for slugs that are not a known category — free
 * text, locations, legacy values — where a best-effort de-slug is correct.
 */
export function resolveEventCategoryLabel(slug: string): string {
  return SLUG_TO_LABEL.get(generateSlug(slug)) ?? undoSlug(slug);
}

/** True when the slug names a category or type the app itself ships. */
export function isKnownEventCategorySlug(slug: string): boolean {
  return SLUG_TO_LABEL.has(generateSlug(slug));
}
