// Monday-first display order (per the Places spec's example ordering),
// mapped onto the DB's day_of_week convention -- 0 = Sunday .. 6 = Saturday,
// matching Postgres's EXTRACT(DOW) and JS's Date.getDay(). Shared between
// PlaceOpeningHoursEditor.tsx (creation flow) and the place details page's
// opening-hours table, so the two never disagree on day ordering/labels.
// Day names come from Intl in the reader's language (dateFormatter.dayName).

import { dayName } from "./dateFormatter";

export const DISPLAY_DAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

export function displayDays(
  locale?: string | null,
): { dayOfWeek: number; label: string }[] {
  return DISPLAY_DAY_ORDER.map((dayOfWeek) => ({
    dayOfWeek,
    label: dayName(dayOfWeek, "long", locale),
  }));
}
