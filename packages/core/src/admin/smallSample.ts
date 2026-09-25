// Small-sample suppression for anything broken down by person.
//
// Abonten has a few thousand users, and a breakdown bucket of one or two is
// not a statistic — it is a person, identifiable by anyone who knows roughly
// who signed up when. Buckets below the floor are reported as "not enough
// data" rather than as a number.
//
// The complement rule matters as much as the floor: if exactly one bucket is
// hidden and the total is shown, subtraction reveals it. So whenever a
// suppression happens, the next-smallest bucket is hidden too.

export const MIN_BUCKET = 5;

export type Bucket = { key: string; count: number };
export type SuppressedBucket = {
  key: string;
  /** null when suppressed — never render a 0 here, it means something else. */
  count: number | null;
  suppressed: boolean;
};
export type SuppressionResult = {
  buckets: SuppressedBucket[];
  /** Total across every bucket, suppressed ones included. */
  total: number;
  suppressedCount: number;
  /** True when nothing survived: show "not enough data", not an empty chart. */
  allSuppressed: boolean;
};

export function applySmallSampleRule(
  buckets: Bucket[],
  min: number = MIN_BUCKET,
): SuppressionResult {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const hidden = new Set<string>();
  for (const b of buckets) if (b.count > 0 && b.count < min) hidden.add(b.key);

  // A single hidden bucket is recoverable by subtraction: hide the smallest
  // visible one alongside it.
  if (hidden.size === 1) {
    const nextSmallest = buckets
      .filter((b) => !hidden.has(b.key) && b.count > 0)
      .sort((a, b) => a.count - b.count)[0];
    // When the small bucket is the only non-empty one, the total itself is
    // that bucket: hide an empty bucket with it so the count cannot be
    // attributed to one answer.
    const fallback = buckets.find((b) => !hidden.has(b.key));
    const pick = nextSmallest ?? fallback;
    if (pick) hidden.add(pick.key);
  }

  const result = buckets.map((b) => ({
    key: b.key,
    count: hidden.has(b.key) ? null : b.count,
    suppressed: hidden.has(b.key),
  }));

  return {
    buckets: result,
    total,
    suppressedCount: hidden.size,
    allSuppressed: result.length > 0 && result.every((b) => b.suppressed),
  };
}

/**
 * Whether a ratio can honestly be shown. A percentage over three people is
 * noise dressed up as precision.
 */
export function ratioState(
  numerator: number,
  denominator: number,
  min: number = MIN_BUCKET,
): "ok" | "insufficient" | "no-data" {
  if (denominator <= 0) return "no-data";
  if (denominator < min) return "insufficient";
  return Number.isFinite(numerator) ? "ok" : "no-data";
}
