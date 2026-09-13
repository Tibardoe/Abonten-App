import type { AdminReadTruncation } from "@abonten/types/adminMetrics";

// Some summaries are still added up in JavaScript from a capped read
// (reward decisions, delivery rows). The cap used to be silent: a page
// summed "the first 10,000" and showed the result as the whole period. The
// cap stays — those tables are small and the aggregation is fiddly — but
// every capped read now asks for the exact row count alongside the rows, so
// the page can say when the sum stopped short.

export const SUMMARY_ROW_CAP = 10_000;

/** Null when every row was read; otherwise how many of how many. */
export function truncation(
  fetched: number,
  total: number | null | undefined,
): AdminReadTruncation | null {
  if (total == null || total <= fetched) return null;
  return { fetched, total };
}

/** The larger of two gaps, for a summary built from more than one read. */
export function worstTruncation(
  ...items: (AdminReadTruncation | null)[]
): AdminReadTruncation | null {
  return items.reduce<AdminReadTruncation | null>((worst, t) => {
    if (!t) return worst;
    if (!worst) return t;
    return t.total - t.fetched > worst.total - worst.fetched ? t : worst;
  }, null);
}
