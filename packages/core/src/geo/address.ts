// A structured address that any country can be written in.
//
// `event.address` and `place.address` are JSON columns that so far held only
// `{ full_address }`. They now hold this shape too, filled from the geocoder
// components when a location is picked. Every field but `full_address` is
// optional because countries differ (no postal codes in Ghana, no regions
// in Singapore); the per-country form rules are in addressSchema.ts.
// The `country_code` column on the row is the queryable copy of
// `address.country_code`; the JSON keeps the detail.

export type StructuredAddress = {
  /** What people see: the formatted address from the geocoder or typed. */
  full_address: string;
  /** ISO 3166-1 alpha-2 (queryable copy lives on the row). */
  country_code?: string | null;
  country?: string | null;
  /** Region / state / province / county (admin level 1). */
  region?: string | null;
  /** City / town (locality). */
  city?: string | null;
  /** Neighbourhood / district / suburb (sublocality). */
  district?: string | null;
  postal_code?: string | null;
  /** Street number + route, or the typed line. */
  street?: string | null;
  /** Geocoder place id (Google), for later lookups. */
  place_id?: string | null;
};

const STRING_KEYS = [
  "country_code",
  "country",
  "region",
  "city",
  "district",
  "postal_code",
  "street",
  "place_id",
] as const;

/** Proves the JSON shape once; every consumer gets a StructuredAddress. */
export function readStructuredAddress(value: unknown): StructuredAddress {
  if (typeof value === "string") return { full_address: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { full_address: "" };
  }
  const raw = value as Record<string, unknown>;
  const out: StructuredAddress = {
    full_address: typeof raw.full_address === "string" ? raw.full_address : "",
  };
  for (const key of STRING_KEYS) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) {
      out[key] = key === "country_code" ? v.trim().toUpperCase() : v.trim();
    }
  }
  return out;
}

/** "Osu, Accra" / "Shoreditch, London" — a short locality line for cards. */
export function shortLocality(a: StructuredAddress): string {
  const parts = [a.district, a.city].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  if (parts.length > 0) return parts.join(", ");
  return a.region ?? a.full_address;
}

/**
 * Builds the JSON to store from geocoder components. Google's address
 * component types are used because both apps geocode through Google; the
 * mapping is the only place those type names appear.
 */
export function addressFromGoogleComponents(
  formatted: string,
  components: readonly {
    long_name: string;
    short_name: string;
    types: readonly string[];
  }[],
  placeId?: string | null,
): StructuredAddress {
  const find = (type: string, short = false) => {
    const c = components.find((x) => x.types.includes(type));
    return c ? (short ? c.short_name : c.long_name) : null;
  };
  const streetNumber = find("street_number");
  const route = find("route");
  const street =
    streetNumber && route
      ? `${streetNumber} ${route}`
      : (route ?? streetNumber);
  return {
    full_address: formatted,
    country_code: find("country", true)?.toUpperCase() ?? null,
    country: find("country"),
    region: find("administrative_area_level_1"),
    city:
      find("locality") ??
      find("postal_town") ??
      find("administrative_area_level_2"),
    district:
      find("sublocality_level_1") ??
      find("sublocality") ??
      find("neighborhood"),
    postal_code: find("postal_code"),
    street,
    place_id: placeId ?? null,
  };
}
