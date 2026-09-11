import { api } from "@/lib/api";
import {
  type StoredTouchMap,
  rememberTouch,
  storedToTouch,
} from "@abonten/core/rewards/referralAttribution";
import { normalizeReferralCode } from "@abonten/core/rewards/referralCode";
import * as SecureStore from "expo-secure-store";

// The referral links this app opened (abontenhub.com/events/…?ref=CODE),
// keyed by the event id the deep link resolved to. Kept on the device for 30
// days so a checkout opened later -- even after signing up -- can send the
// latest one as a hint. The same pure rules as the web cookie
// (@abonten/core/rewards/referralAttribution); the server re-validates.

const KEY = "abonten.referralTouches";

async function readMap(): Promise<StoredTouchMap> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as StoredTouchMap)
      : {};
  } catch {
    return {};
  }
}

/**
 * Remembers a referral link that pointed at an event or place, and logs the
 * visit (fire-and-forget). Never throws: it must not slow down or break the
 * deep link that carried it.
 */
export async function captureReferral(
  rawCode: string | null,
  target: { eventId?: string; placeId?: string },
): Promise<void> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return;
  try {
    const key = target.eventId
      ? `e:${target.eventId}`
      : target.placeId
        ? `p:${target.placeId}`
        : "u";
    const now = Date.now();
    const next = rememberTouch(
      await readMap(),
      key,
      { c: code, t: now },
      { now },
    );
    await SecureStore.setItemAsync(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable -- the server-side touch below still counts
  }
  api.rewards
    .touch({
      code,
      eventId: target.eventId ?? null,
      placeId: target.placeId ?? null,
    })
    .catch(() => {});
}

/** The referral link to send with a checkout for this event, if any. */
export async function referralHintForEvent(
  eventId: string,
): Promise<{ code: string; touchedAt: string } | null> {
  const touch = storedToTouch((await readMap())[`e:${eventId}`]);
  return touch ? { code: touch.code, touchedAt: touch.touchedAt } : null;
}
