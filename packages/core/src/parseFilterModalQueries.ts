import { formatMoney } from "./formatMoney";

type FilterParams = {
  price?: string;
  rating?: string;
  distance?: string;
  from?: string;
  to?: string;
  lat?: string;
  lng?: string;
};

// Parses the /search filter modal's query string into get_filtered_events
// parameters. A missing filter is null, never a "match everything" number:
// get_filtered_events skips a null clause, whereas the old defaults (price
// 0-999999 always on) silently dropped any event without a ticket type.
//
// Distance is kilometres. It used to be multiplied by 1000 here and then
// multiplied by 1000 again inside the RPC (p_max_distance_km * 1000), so
// "Up to 3km" searched a 3,000 km radius and the filter did nothing.
export const ANY_DISTANCE_KM = 20_000;

export function parseFilters(params: FilterParams) {
  let minPrice: number | null = null;
  let maxPrice: number | null = null;
  if (params.price) {
    // "0-250" -> 0 and 250; "0-999" is the modal's "Any". Links written
    // before prices were currency-neutral ("GHS 0 - GHS 250") parse the same.
    const priceMatch = params.price.match(/(\d+)\D+(\d+|any)/i);
    if (priceMatch) {
      const min = Number(priceMatch[1]);
      const max =
        priceMatch[2].toLowerCase() === "any" ? null : Number(priceMatch[2]);
      const isAny = min === 0 && (max === null || max >= 999);
      if (!isAny) {
        minPrice = min;
        maxPrice = max === null || max >= 999 ? 999999 : max;
      }
    }
  }

  // "From 4.5" -> 4.5
  const rating = params.rating
    ? Number.parseFloat(params.rating.replace(/[^\d.]/g, ""))
    : Number.NaN;
  const minRating = Number.isFinite(rating) ? rating : null;

  // "Up to 3km" -> 3 (kilometres)
  const distance = params.distance
    ? Number.parseFloat(params.distance.replace(/[^\d.]/g, ""))
    : Number.NaN;
  const maxDistanceKm = Number.isFinite(distance) ? distance : null;

  const startDate = params.from ? new Date(params.from).toISOString() : null;
  const endDate = params.to ? new Date(params.to).toISOString() : null;

  const latNum = params.lat ? Number(params.lat) : Number.NaN;
  const lngNum = params.lng ? Number(params.lng) : Number.NaN;
  const lat = Number.isFinite(latNum) ? latNum : null;
  const lng = Number.isFinite(lngNum) ? lngNum : null;

  return {
    minPrice,
    maxPrice,
    minRating,
    // With coordinates but no chosen radius, get_filtered_events would
    // compare against a NULL radius and drop every event; half the Earth's
    // circumference keeps the distance column without filtering anything.
    maxDistanceKm:
      maxDistanceKm ?? (lat !== null && lng !== null ? ANY_DISTANCE_KM : null),
    startDate,
    endDate,
    lat,
    lng,
  };
}

/** The ?price= value the filter modal writes: currency-neutral, "0-250". */
export function priceParam(min: number, max: number): string {
  return `${Math.max(0, Math.round(min))}-${Math.max(0, Math.round(max))}`;
}

/** True when ?price= is absent or the modal's unfiltered "Any" range. */
export function isAnyPriceParam(raw: string | null | undefined): boolean {
  if (!raw) return true;
  const { minPrice, maxPrice } = parseFilters({ price: raw });
  return minPrice == null && maxPrice == null;
}

/** "GH₵20 – GH₵250" / "From GH₵20" for a chip, in the market's currency. */
export function describePriceParam(
  raw: string | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (isAnyPriceParam(raw)) return null;
  const { minPrice, maxPrice } = parseFilters({ price: raw ?? "" });
  const f = (n: number) => formatMoney(currency, n, { trimZeroFraction: true });
  if (maxPrice == null || maxPrice >= 999999) return `From ${f(minPrice ?? 0)}`;
  return `${f(minPrice ?? 0)} – ${f(maxPrice)}`;
}
