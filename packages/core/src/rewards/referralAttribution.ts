// Which referral link gets the credit for a ticket purchase. Shared by the
// server (validateCheckoutCore), the web referral cookie and the mobile
// capture store, so every surface keeps and picks touches the same way.
//
// Event referrals are LAST TOUCH, per event: the link someone opened most
// recently before buying is the one that drove the sale. A touch only counts
// within the attribution window (7 days by default,
// reward_program_setting.referral_attribution_window_days). The server
// re-validates whatever this picks (stamp_checkout_referral): a
// client-supplied touch is only ever a hint.

export type ReferralTouchSource = "link" | "qr" | "install_referrer";

export type ReferralTouch = {
  code: string;
  /** ISO timestamp of the click. */
  touchedAt: string;
  source: ReferralTouchSource;
};

/** Up to 5 minutes of clock skew is tolerated for a touch "in the future". */
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const DAY_MS = 86_400_000;

export function isTouchWithinWindow(
  touch: Pick<ReferralTouch, "touchedAt">,
  now: number,
  windowDays: number,
): boolean {
  const at = Date.parse(touch.touchedAt);
  if (!Number.isFinite(at)) return false;
  return at <= now + MAX_FUTURE_SKEW_MS && at >= now - windowDays * DAY_MS;
}

/**
 * The winning touch: the most recent one inside the window whose code isn't
 * excluded (e.g. the buyer's own code). Null when none qualifies.
 */
export function pickReferralTouch(
  candidates: readonly (ReferralTouch | null | undefined)[],
  options: {
    now: number;
    windowDays: number;
    excludeCodes?: readonly string[];
  },
): ReferralTouch | null {
  const excluded = new Set(options.excludeCodes ?? []);
  let best: ReferralTouch | null = null;
  for (const touch of candidates) {
    if (!touch || excluded.has(touch.code)) continue;
    if (!isTouchWithinWindow(touch, options.now, options.windowDays)) continue;
    if (!best || Date.parse(touch.touchedAt) > Date.parse(best.touchedAt)) {
      best = touch;
    }
  }
  return best;
}

export type StoredTouch = { c: string; t: number; s?: ReferralTouchSource };
export type StoredTouchMap = Record<string, StoredTouch>;

/**
 * Adds a touch to a small keyed store (web cookie / mobile SecureStore),
 * dropping entries older than `ttlDays` and keeping only the newest
 * `maxEntries`. Keys identify what the link pointed at (an event, a place).
 */
export function rememberTouch(
  map: StoredTouchMap,
  key: string,
  touch: StoredTouch,
  options: { now: number; ttlDays?: number; maxEntries?: number },
): StoredTouchMap {
  const ttlMs = (options.ttlDays ?? 30) * DAY_MS;
  const entries = Object.entries({ ...map, [key]: touch })
    .filter(
      ([, value]) =>
        value &&
        typeof value.c === "string" &&
        Number.isFinite(value.t) &&
        value.t > options.now - ttlMs,
    )
    .sort(([, a], [, b]) => b.t - a.t)
    .slice(0, options.maxEntries ?? 10);
  return Object.fromEntries(entries);
}

export function storedToTouch(
  stored: StoredTouch | undefined,
): ReferralTouch | null {
  if (!stored) return null;
  return {
    code: stored.c,
    touchedAt: new Date(stored.t).toISOString(),
    source: stored.s ?? "link",
  };
}
