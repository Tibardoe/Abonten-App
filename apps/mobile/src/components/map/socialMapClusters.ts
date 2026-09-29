// Clustering for the social map. Pure — no React, no native modules.
//
// Pins merge when they would overlap on screen: within about a pin's width
// of the first pin of a group. That width is tied to a ZOOM LEVEL, not to the
// exact region — about a fifth of the visible width, rounded to a power of
// two degrees — so clusters stay put while the map is panned or nudged in
// and out, and only change when the zoom crosses a level. (A plain grid did
// that too, but split two pins 100 m apart whenever a cell border fell
// between them, and they were drawn on top of each other as one.)

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type Clusterable = {
  id: string;
  point: { lat: number; lng: number };
};

export type Cluster<T extends Clusterable> =
  | { kind: "point"; key: string; item: T; lat: number; lng: number }
  | {
      kind: "cluster";
      key: string;
      count: number;
      lat: number;
      lng: number;
      items: T[];
    };

const CELLS_ACROSS = 5;
// A pin's width, as a share of a level's cell (see gridLevel).
const PIN_SHARE_OF_CELL = 0.7;

// Zooming into a cluster stops at this span (~550 m). A cluster still intact
// here is a set of pins at (nearly) the same spot — the same venue, a place
// and its events — and no amount of zoom will split it, so a tap opens the
// list instead. Before this, three places sharing one point clustered forever
// and could never be opened from the map.
export const MIN_DELTA = 0.005;

// Points closer than this are "the same spot" regardless of zoom.
const SAME_SPOT_DEG = 0.0004; // ~45 m

/** The zoom level for a region (log2 of a fifth of its width in degrees). */
export function gridLevel(region: MapRegion): number {
  return Math.round(Math.log2(region.longitudeDelta / CELLS_ACROSS));
}

/**
 * How many degrees of latitude look as tall on screen as one degree of
 * longitude is wide, at these items' latitude (Mercator stretches latitude
 * by 1/cos). Taken from the items, not the region, so panning north or south
 * never changes the clusters.
 */
export function latitudeScale(items: Clusterable[]): number {
  if (items.length === 0) return 1;
  const mean = items.reduce((s, i) => s + i.point.lat, 0) / items.length;
  return Math.max(0.2, Math.cos((mean * Math.PI) / 180));
}

/**
 * Groups are seeded in list order, so the result depends only on the items
 * and the level. `keepApart` (the selected pin) always comes out as its own
 * point, in the same place in the list it has when it is not selected — so
 * selecting or deselecting never reorders the markers (a reordered native
 * marker is taken off the map and put back).
 */
export function clusterize<T extends Clusterable>(
  items: T[],
  level: number,
  latScale: number,
  keepApart: string | null = null,
): Cluster<T>[] {
  const reachLng = PIN_SHARE_OF_CELL * 2 ** level;
  const reachLat = reachLng * latScale;
  const groups: { seed: T; members: T[]; alone: boolean }[] = [];
  for (const item of items) {
    const alone = item.id === keepApart;
    const group = alone
      ? undefined
      : groups.find((g) => {
          if (g.alone) return false;
          const dx = (item.point.lng - g.seed.point.lng) / reachLng;
          const dy = (item.point.lat - g.seed.point.lat) / reachLat;
          return dx * dx + dy * dy < 1;
        });
    if (group) group.members.push(item);
    else groups.push({ seed: item, members: [item], alone });
  }
  return groups.map(({ seed, members }): Cluster<T> => {
    if (members.length === 1) {
      return {
        kind: "point",
        key: seed.id,
        item: seed,
        lat: seed.point.lat,
        lng: seed.point.lng,
      };
    }
    return {
      kind: "cluster",
      key: `c${level}:${seed.id}`,
      count: members.length,
      lat: members.reduce((s, i) => s + i.point.lat, 0) / members.length,
      lng: members.reduce((s, i) => s + i.point.lng, 0) / members.length,
      items: members,
    };
  });
}

/** Whether every item sits at (nearly) the same point. */
export function spansOneSpot(items: Clusterable[]): boolean {
  const b = boundsOf(items);
  return (
    b.maxLat - b.minLat < SAME_SPOT_DEG && b.maxLng - b.minLng < SAME_SPOT_DEG
  );
}

/** A region that shows every item with some room around them. */
export function regionAround(items: Clusterable[]): MapRegion {
  const b = boundsOf(items);
  return {
    latitude: (b.minLat + b.maxLat) / 2,
    longitude: (b.minLng + b.maxLng) / 2,
    latitudeDelta: Math.max((b.maxLat - b.minLat) * 1.8, MIN_DELTA),
    longitudeDelta: Math.max((b.maxLng - b.minLng) * 1.8, MIN_DELTA),
  };
}

function boundsOf(items: Clusterable[]) {
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  for (const i of items) {
    minLat = Math.min(minLat, i.point.lat);
    maxLat = Math.max(maxLat, i.point.lat);
    minLng = Math.min(minLng, i.point.lng);
    maxLng = Math.max(maxLng, i.point.lng);
  }
  return { minLat, maxLat, minLng, maxLng };
}
