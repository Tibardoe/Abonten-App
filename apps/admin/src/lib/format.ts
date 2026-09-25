// Fixed-locale, fixed-timezone formatters for the console.
//
// `toLocaleDateString()` renders in the *server's* locale during SSR and the
// *browser's* in the client, so the same timestamp can read "13/09/2026" on
// one and "9/13/2026" on the other — a hydration mismatch and, worse, an
// ambiguous date for an operator. The console shows every timestamp on ONE
// operations clock, UTC, with the same en-GB pattern everywhere — the clock
// its date ranges are cut on (@abonten/core/admin/adminDateRange), whichever
// markets are open. (Ghana, the first market, is UTC+0, so for it this is
// also local time.) Things that happen on a place's own clock — an edition's
// publish time, an event's start — are shown in that zone, labelled.

export const OPS_TIME_ZONE = "UTC";
/** Printed next to times so an operator never has to guess the clock. */
export const OPS_TIME_ZONE_LABEL = "UTC";

const DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: OPS_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: OPS_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** `formatOpsDate("2026-09-13T…")` -> `"13 Sep 2026"`. */
export function formatOpsDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE.format(d);
}

/** `formatOpsDateTime(…)` -> `"13 Sep 2026, 14:30"`. */
export function formatOpsDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_TIME.format(d);
}
