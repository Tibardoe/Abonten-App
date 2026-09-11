import {
  type StoredTouch,
  type StoredTouchMap,
  rememberTouch,
} from "@abonten/core/rewards/referralAttribution";
import { normalizeReferralCode } from "@abonten/core/rewards/referralCode";
import {
  deriveSigningKey,
  hmacBase64Url,
  signaturesMatch,
} from "../security/signing";

// The web's referral cookie (`abn_ref`): which referral links this browser
// opened recently, keyed by what the link pointed at. Written by proxy.ts
// (no database work on that hot path), read back at checkout.
//
// Keys: `e:<event slug>`, `p:<place slug>`, `u` for any other page. The
// proxy only knows the URL, not the event id, so events are keyed by the
// slug in their link and matched against the event at checkout.
//
// Signed (HMAC) so a browser can't invent touches with made-up timestamps;
// the server still re-validates every code and window when it uses one.

export const REFERRAL_COOKIE_NAME = "abn_ref";
export const DEVICE_COOKIE_NAME = "abn_did";
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 86_400;

const PURPOSE = "referral-cookie:v1";

function isStoredTouch(value: unknown): value is StoredTouch {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.c === "string" &&
    normalizeReferralCode(v.c) === v.c &&
    typeof v.t === "number" &&
    Number.isFinite(v.t)
  );
}

export function encodeReferralCookie(
  map: StoredTouchMap,
  key: Buffer = deriveSigningKey(PURPOSE),
): string {
  const payload = Buffer.from(JSON.stringify(map)).toString("base64url");
  return `${payload}.${hmacBase64Url(key, payload)}`;
}

/** The touches in a cookie value; {} if it's missing, malformed or forged. */
export function decodeReferralCookie(
  value: string | null | undefined,
  key?: Buffer,
): StoredTouchMap {
  if (!value) return {};
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return {};
  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (
    !signaturesMatch(
      signature,
      hmacBase64Url(key ?? deriveSigningKey(PURPOSE), payload),
    )
  ) {
    return {};
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, v]) =>
        isStoredTouch(v),
      ),
    ) as StoredTouchMap;
  } catch {
    return {};
  }
}

/** The cookie key for a page path, e.g. `/events/afro-fest` -> `e:afro-fest`. */
export function referralKeyForPath(pathname: string): string {
  const [section, slug] = pathname.split("/").filter(Boolean);
  if (section === "events" && slug) return `e:${decodeURIComponent(slug)}`;
  if (section === "places" && slug) return `p:${decodeURIComponent(slug)}`;
  return "u";
}

/**
 * The new cookie value after opening `pathname?ref=code`, or null when the
 * code isn't a valid code.
 */
export function addTouchToCookie(
  currentValue: string | null | undefined,
  pathname: string,
  rawCode: string,
  now: number,
  key?: Buffer,
): string | null {
  const code = normalizeReferralCode(rawCode);
  if (!code) return null;
  const signingKey = key ?? deriveSigningKey(PURPOSE);
  const next = rememberTouch(
    decodeReferralCookie(currentValue, signingKey),
    referralKeyForPath(pathname),
    { c: code, t: now },
    { now },
  );
  return encodeReferralCookie(next, signingKey);
}
