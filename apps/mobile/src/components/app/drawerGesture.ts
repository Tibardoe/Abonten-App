// The drawer's left-edge swipe catcher (AppDrawer) is an overlay above every
// tab root, so a horizontal control that reaches the left screen edge — the
// Spotlight timeline — shares its first 22 dp with it. Such a control claims
// the band of window rows it occupies, and the drawer draws its catcher with
// a gap there: gesture-handler stops looking for handlers at the topmost view
// under the finger, so a catcher that merely declined the touch would still
// have kept it from the control underneath. Everywhere else the edge opens
// the drawer as before.

export type EdgeBand = { top: number; bottom: number };

let bands: EdgeBand[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Claim a band of window rows (dp). Returns the release function. */
export function claimDrawerEdge(band: EdgeBand): () => void {
  bands = [...bands, band];
  emit();
  return () => {
    bands = bands.filter((b) => b !== band);
    emit();
  };
}

export function subscribeDrawerEdgeClaims(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDrawerEdgeClaims(): EdgeBand[] {
  return bands;
}

/** The rows of [top, bottom] left to the catcher once the claims are cut out. */
export function edgeSegments(
  top: number,
  bottom: number,
  claims: readonly EdgeBand[],
): EdgeBand[] {
  const cuts = [...claims].sort((a, b) => a.top - b.top);
  const out: EdgeBand[] = [];
  let cursor = top;
  for (const c of cuts) {
    if (c.bottom <= cursor || c.top >= bottom) continue;
    if (c.top > cursor) out.push({ top: cursor, bottom: c.top });
    cursor = Math.max(cursor, c.bottom);
  }
  if (cursor < bottom) out.push({ top: cursor, bottom });
  return out;
}
