import type { GeoJsonPolygon } from "@abonten/types/fieldOps";

// Pure geometry helpers for Field Ops territories. The database function
// fieldops_territory_contains (PostGIS) is the authority for every decision
// that matters; these mirror it for UI previews and unit tests.

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_008.8;

export function isValidLatLng(point: LatLng): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

/** Great-circle distance in metres (haversine). */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Ray-casting point-in-polygon on the outer ring (holes are ignored — a
 * territory boundary never has any). Coordinates are GeoJSON [lng, lat].
 */
export function pointInPolygon(
  point: LatLng,
  polygon: GeoJsonPolygon,
): boolean {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 4) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export type TerritoryShape = {
  centre: LatLng;
  radiusM: number;
  boundary: GeoJsonPolygon | null;
};

/** Polygon when present, else the circle — the same rule as the database. */
export function territoryContains(
  territory: TerritoryShape,
  point: LatLng,
): boolean {
  if (!isValidLatLng(point)) return false;
  if (territory.boundary) return pointInPolygon(point, territory.boundary);
  return distanceMetres(territory.centre, point) <= territory.radiusM;
}

/**
 * Validates a GeoJSON polygon the way the database will accept it: one
 * closed outer ring of at least four positions with valid coordinates.
 * Returns a message, or null when valid.
 */
export function validatePolygon(polygon: unknown): string | null {
  if (!polygon || typeof polygon !== "object")
    return "Boundary must be a GeoJSON Polygon.";
  const p = polygon as Partial<GeoJsonPolygon>;
  if (p.type !== "Polygon" || !Array.isArray(p.coordinates)) {
    return "Boundary must be a GeoJSON Polygon.";
  }
  if (p.coordinates.length < 1) return "Boundary needs an outer ring.";
  const ring = p.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) {
    return "The outer ring needs at least four positions.";
  }
  for (const pos of ring) {
    if (
      !Array.isArray(pos) ||
      pos.length < 2 ||
      !isValidLatLng({ lng: Number(pos[0]), lat: Number(pos[1]) })
    ) {
      return "Every position must be [longitude, latitude].";
    }
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return "The outer ring must end where it starts.";
  }
  return null;
}
