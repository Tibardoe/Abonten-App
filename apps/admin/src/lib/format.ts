// Fixed-locale, fixed-timezone formatters for the console.
//
// `toLocaleDateString()` renders in the *server's* locale during SSR and the
// *browser's* in the client, so the same timestamp can read "13/09/2026" on
// one and "9/13/2026" on the other — a hydration mismatch and, worse, an
// ambiguous date for an operator. Abonten operates in Ghana, so every date
// in the console is shown in Africa/Accra with the same en-GB pattern
// everywhere (the technique `(console)/weekly/format.ts` introduced).

const DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Accra",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Accra",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** `formatAccraDate("2026-09-13T…")` -> `"13 Sep 2026"`. */
export function formatAccraDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE.format(d);
}

/** `formatAccraDateTime(…)` -> `"13 Sep 2026, 14:30"`. */
export function formatAccraDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_TIME.format(d);
}
