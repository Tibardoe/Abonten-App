import type { Occurrence } from "@abonten/types/occurrenceType";

// `event.address` and `place.address` are JSON columns. The application
// stores `{ full_address: string, ... }` in them, but the database type is
// `Json`, so anything reading the column has to prove the shape once. These
// helpers are that proof: every consumer gets a `{ full_address }` object
// and never touches the raw JSON. The discovery RPCs also return an event's
// occurrences as a JSON array, which gets the same treatment.

export type EventAddress = { full_address: string };

export function readEventAddress(value: unknown): EventAddress {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const full = (value as { full_address?: unknown }).full_address;
    if (typeof full === "string") return { full_address: full };
  }
  if (typeof value === "string") return { full_address: value };
  return { full_address: "" };
}

export function readOccurrences(value: unknown): Occurrence[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Occurrence[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { id, starts_at, ends_at } = item as Record<string, unknown>;
    if (typeof starts_at !== "string" || typeof ends_at !== "string") continue;
    out.push({
      ...(typeof id === "string" ? { id } : {}),
      starts_at,
      ends_at,
    });
  }
  return out;
}

type Normalized<T> = Omit<T, "address" | "occurrences" | "location"> & {
  address: EventAddress;
  occurrences?: Occurrence[];
  /** PostGIS geography as PostgREST sends it: a WKB hex string. */
  location?: string;
};

/**
 * Replaces a row's raw JSON `address` (and `occurrences` / `location`, when
 * the row has them) with parsed values. Every other field passes through unchanged, so
 * the compiler still checks the rest of the row against the domain type at
 * the call site.
 */
export function normalizeEventRow<T extends { address: unknown }>(
  row: T,
): Normalized<T> {
  const { address, ...rest } = row as T & {
    occurrences?: unknown;
    location?: unknown;
  };
  const out = { ...rest, address: readEventAddress(address) } as Normalized<T>;
  if ("location" in row) {
    const location = (row as { location?: unknown }).location;
    out.location = typeof location === "string" ? location : undefined;
  }
  if ("occurrences" in row) {
    out.occurrences = readOccurrences(
      (row as { occurrences?: unknown }).occurrences,
    );
  }
  return out;
}
