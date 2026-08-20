// Monday-first display order (per the Places spec's example ordering),
// mapped onto the DB's day_of_week convention -- 0 = Sunday .. 6 = Saturday,
// matching Postgres's EXTRACT(DOW) and JS's Date.getDay(). Shared between
// PlaceOpeningHoursEditor.tsx (creation flow) and the place details page's
// opening-hours table, so the two never disagree on day ordering/labels.
export const DISPLAY_DAYS: { dayOfWeek: number; label: string }[] = [
  { dayOfWeek: 1, label: "Monday" },
  { dayOfWeek: 2, label: "Tuesday" },
  { dayOfWeek: 3, label: "Wednesday" },
  { dayOfWeek: 4, label: "Thursday" },
  { dayOfWeek: 5, label: "Friday" },
  { dayOfWeek: 6, label: "Saturday" },
  { dayOfWeek: 0, label: "Sunday" },
];
