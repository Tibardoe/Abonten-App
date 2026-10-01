// Event categories and types are stored on events as their English names
// (there is no event_category table), and place categories as rows of
// place_category. Both are shown in the reader's language: the stored
// value picks a key under `eventCategories.*` / `eventTypes.*` /
// `placeCategories.*` of the core namespace. A value that is not in the
// catalog (an older event, a category added to the table later) is shown
// as stored. (eventCategoryLabels.ts is the separate URL-slug reverse index.)

import { eventCategoriesAndTypes } from "./eventCategoriesAndTypes";
import type { CoreTranslator } from "./i18n/translator";

/** "Arts, Culture & Theatre" → "artsCultureAndTheatre". */
export function categoryKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ");
  return words
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
}

const CATEGORY_KEYS = new Map<string, string>();
const TYPE_KEYS = new Map<string, string>();
for (const entry of eventCategoriesAndTypes) {
  CATEGORY_KEYS.set(entry.category, categoryKey(entry.category));
  for (const type of entry.types) TYPE_KEYS.set(type, categoryKey(type));
}

/** Every catalog key an event category or type can produce (for the tests). */
export const EVENT_CATEGORY_KEYS: readonly string[] = [
  ...CATEGORY_KEYS.values(),
];
export const EVENT_TYPE_KEYS: readonly string[] = [
  ...new Set(TYPE_KEYS.values()),
];

export function eventCategoryLabel(t: CoreTranslator, name: string): string {
  const key = CATEGORY_KEYS.get(name);
  return key ? t(`eventCategories.${key}`) : name;
}

export function eventTypeLabel(t: CoreTranslator, name: string): string {
  const key = TYPE_KEYS.get(name);
  return key ? t(`eventTypes.${key}`) : name;
}

/** The slugs seeded into place_category (20260820090000_add_places_feature). */
export const PLACE_CATEGORY_SLUGS: readonly string[] = [
  "restaurant",
  "food-spot",
  "pub",
  "nightclub",
  "gaming-center",
  "cinema",
  "gym-fitness",
  "hotel",
  "supermarket",
  "skating",
  "go-karting",
  "entertainment",
  "recreation",
  "other",
] as const;

function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * A place category in the reader's language. Pass the row's slug when you
 * have it; the name alone works for the seeded categories too.
 */
export function placeCategoryLabel(
  t: CoreTranslator,
  category: { slug?: string | null; name?: string | null },
): string {
  const slug = category.slug ?? (category.name ? slugOf(category.name) : null);
  if (slug && PLACE_CATEGORY_SLUGS.includes(slug)) {
    return t(`placeCategories.${slug}`);
  }
  return category.name ?? "";
}
