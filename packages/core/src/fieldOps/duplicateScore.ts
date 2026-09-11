// How likely an existing listing is the business a field member is about
// to onboard. The database does the trigram similarity and the distance
// (fieldops_find_similar_places); this turns those numbers into one score
// and a "strong match" verdict the wizard and the sweep both use.

export type SimilarPlaceSignal = {
  /** pg_trgm similarity of the names, 0..1. */
  similarity: number;
  /** Metres between the existing listing and the new pin. */
  distanceM: number;
  /** Same phone or WhatsApp number as an existing listing. */
  phoneMatch: boolean;
};

export type DuplicateThresholds = {
  /** Listings within this distance are compared by name. */
  radiusM: number;
  /** Name similarity at or above this counts as "the same business". */
  similarityThreshold: number;
};

export type DuplicateScore = { score: number; strong: boolean };

/**
 * A phone match is decisive. Otherwise the name similarity is discounted
 * by distance: a same-name listing 50 m away is a strong match, the same
 * name at the far edge of the radius is worth a look, beyond the radius it
 * only counts as a weak hint.
 */
export function scoreSimilarPlace(
  signal: SimilarPlaceSignal,
  thresholds: DuplicateThresholds,
): DuplicateScore {
  if (signal.phoneMatch) return { score: 1, strong: true };
  const radius = Math.max(1, thresholds.radiusM);
  const proximity =
    signal.distanceM <= radius ? 1 - (signal.distanceM / radius) * 0.4 : 0.5;
  const similarity = Math.min(1, Math.max(0, signal.similarity));
  const score = Math.round(similarity * proximity * 1000) / 1000;
  const strong =
    signal.distanceM <= radius &&
    similarity >= Math.max(thresholds.similarityThreshold, 0.6);
  return { score, strong };
}

export function hasStrongMatch(
  signals: SimilarPlaceSignal[],
  thresholds: DuplicateThresholds,
): boolean {
  return signals.some((s) => scoreSimilarPlace(s, thresholds).strong);
}
