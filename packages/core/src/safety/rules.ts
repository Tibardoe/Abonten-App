// The timing and visibility rules of Abonten Safety, shared by the services,
// the website and the app (docs/architecture/safety.md). Pure: every
// function takes `now` so it can be tested and so the server's answer and
// the screen's agree.

import type {
  SafetyChannel,
  SafetyDeliveryState,
  SafetyLocationPoint,
  SafetyLocationState,
  SafetyRelationship,
  SafetySessionKind,
  SafetySessionStatus,
} from "@abonten/types/safetyType";

/** How long the SOS button is held before the alert goes. */
export const SOS_HOLD_MS = 1500;

/** How often an open session sends its position while the app is in front. */
export const LOCATION_INTERVAL_ALERT_MS = 20_000;
export const LOCATION_INTERVAL_MS = 60_000;

/** A position older than this reads as "last seen …" rather than live. */
export const LOCATION_STALE_MS = 3 * 60_000;

/** An alert nobody closed stays visible to contacts this long after it expires. */
export const EXPIRED_ALERT_VISIBLE_MS = 24 * 60 * 60_000;

/** How often the contact page asks again while the session is open. */
export const VIEW_POLL_SECONDS = 15;

/** The local reminder before a check-in is due. */
export const CHECK_IN_REMINDER_LEAD_MS = 5 * 60_000;

export const CHECK_IN_PRESET_MINUTES = [30, 60, 120, 180] as const;
export const CHECK_IN_MIN_MINUTES = 10;
export const CHECK_IN_MAX_MINUTES = 12 * 60;
export const CHECK_IN_EXTEND_MINUTES = [15, 30, 60] as const;

export const SHARE_PRESET_HOURS = [1, 2, 4, 8] as const;

export const SAFETY_NOTE_MAX = 280;
export const SAFETY_CONTACT_NAME_MAX = 60;

export const SAFETY_RELATIONSHIPS = [
  "family",
  "partner",
  "friend",
  "roommate",
  "colleague",
  "other",
] as const satisfies readonly SafetyRelationship[];

/** Re-sending an invite: once a day, at most three times in all. */
export const INVITE_RESEND_AFTER_MS = 24 * 60 * 60_000;
export const INVITE_MAX_SENDS = 3;

/** Outbox retries for a text: 1, 2 and 5 minutes after a failure. */
export const MESSAGE_RETRY_DELAYS_MS = [60_000, 120_000, 300_000] as const;
export const MESSAGE_MAX_ATTEMPTS = MESSAGE_RETRY_DELAYS_MS.length + 1;

export function isSessionOpen(status: SafetySessionStatus): boolean {
  return status === "active" || status === "alerting";
}

/** When an outbox row that just failed should be tried again, or null to stop. */
export function nextAttemptAt(attempts: number, now: number): Date | null {
  if (attempts >= MESSAGE_MAX_ATTEMPTS) return null;
  const delay =
    MESSAGE_RETRY_DELAYS_MS[
      Math.min(Math.max(attempts - 1, 0), MESSAGE_RETRY_DELAYS_MS.length - 1)
    ];
  return new Date(now + delay);
}

type VisibilityInput = {
  status: SafetySessionStatus;
  alertedAt: string | null;
  resolution: string | null;
  resolvedAt: string | null;
};

/**
 * Whether a contact may see where the person is: while the session is open,
 * and for a day after an alert ran out without anyone closing it. Never once
 * the person said they are safe, called it a mistake or ended a share.
 */
export function isLocationVisible(
  session: VisibilityInput,
  now: number,
): boolean {
  if (isSessionOpen(session.status)) return true;
  if (
    session.status === "expired" &&
    session.alertedAt &&
    session.resolution === "expired" &&
    session.resolvedAt
  ) {
    return now - Date.parse(session.resolvedAt) < EXPIRED_ALERT_VISIBLE_MS;
  }
  return false;
}

export function locationState(
  session: VisibilityInput,
  last: SafetyLocationPoint | null,
  now: number,
): SafetyLocationState {
  if (!isLocationVisible(session, now)) return "hidden";
  if (!last) return "none";
  if (!isSessionOpen(session.status)) return "stale";
  return now - Date.parse(last.at) > LOCATION_STALE_MS ? "stale" : "live";
}

/** How often the app reports its position for a session in this state. */
export function locationIntervalMs(status: SafetySessionStatus): number | null {
  if (status === "alerting") return LOCATION_INTERVAL_ALERT_MS;
  if (status === "active") return LOCATION_INTERVAL_MS;
  return null;
}

export function clampCheckInMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return CHECK_IN_PRESET_MINUTES[1];
  return Math.min(
    CHECK_IN_MAX_MINUTES,
    Math.max(CHECK_IN_MIN_MINUTES, Math.round(minutes)),
  );
}

/**
 * When an open session ends by itself. An alert lasts `alertHours`; a share
 * lasts what was asked, never more than `shareMaxHours`; a check-in waits for
 * its time, then would last as an alert.
 */
export function sessionEndsAt(input: {
  kind: SafetySessionKind;
  now: number;
  alertHours: number;
  shareMaxHours: number;
  dueAt?: number | null;
  shareEndsAt?: number | null;
}): Date {
  const hour = 60 * 60_000;
  if (input.kind === "sos")
    return new Date(input.now + input.alertHours * hour);
  if (input.kind === "check_in") {
    const due = input.dueAt ?? input.now;
    return new Date(due + input.alertHours * hour);
  }
  const latest = input.now + input.shareMaxHours * hour;
  const asked = input.shareEndsAt ?? latest;
  return new Date(Math.min(Math.max(asked, input.now + 15 * 60_000), latest));
}

const DELIVERY_RANK: Record<SafetyDeliveryState, number> = {
  sent: 5,
  sending: 4,
  pending: 3,
  failed: 2,
  skipped: 1,
  none: 0,
};

/** One state for a recipient's row: the best any channel reached. */
export function bestDelivery(
  channels: Record<SafetyChannel, SafetyDeliveryState>,
): SafetyDeliveryState {
  let best: SafetyDeliveryState = "none";
  for (const state of Object.values(channels)) {
    if (DELIVERY_RANK[state] > DELIVERY_RANK[best]) best = state;
  }
  return best;
}
