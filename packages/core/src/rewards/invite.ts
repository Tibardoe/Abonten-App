import type {
  ReferralBindOutcome,
  ReferralBindResult,
} from "@abonten/types/rewards";
import type { CoreTranslator } from "../i18n/translator";
import { formatCredit } from "./creditAmount";
import type { StoredTouch, StoredTouchMap } from "./referralAttribution";
import { normalizeReferralCode } from "./referralCode";

// Friend invites (Abonten Rewards Phase 5): abontenhub.com/invite/CODE.
// Shared by the web (proxy cookie, invite page, sign-in field), the app (deep
// link, install referrer, sign-in field) and the server, so every surface
// reads and words an invite the same way. The server (referral_bind) makes
// every real decision; a code a client holds is only a hint.

export const SITE_ORIGIN = "https://abontenhub.com";
export const INVITE_PATH = "/invite";

/** Where an invite captured on this device came from. */
export type InviteSource = "link" | "typed" | "install_referrer";

/**
 * The invite entry in a StoredTouchMap (the web abn_ref cookie). `u` is a
 * `?ref=CODE` link to any page other than an event or place -- treated as an
 * invite too.
 */
export const INVITE_KEY = "i";
const GENERIC_KEY = "u";

/**
 * A readable "there's an invite to apply" flag cookie (no code in it -- that
 * stays in the signed httpOnly abn_ref cookie), so the web page only asks the
 * server to bind when there's something to bind.
 */
export const INVITE_FLAG_COOKIE_NAME = "abn_inv";

/** An invite counts for 30 days from the click until sign-up. */
export const INVITE_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export const ANDROID_PACKAGE = "com.abonten.app";
// Flip to true once the app is live on Google Play; until then the invite
// page doesn't show a store link that would 404.
export const ANDROID_APP_LISTED = false;

export function inviteUrl(code: string, origin: string = SITE_ORIGIN): string {
  return `${origin.replace(/\/$/, "")}${INVITE_PATH}/${code}`;
}

/**
 * The Play Store link. With a code, Google Play hands `ref=CODE` to the app
 * on first launch (Play Install Referrer), so an invite survives the install.
 */
export function playStoreUrl(code?: string | null): string {
  const base = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  return code ? `${base}&referrer=${encodeURIComponent(`ref=${code}`)}` : base;
}

/** The code in an /invite/CODE path, or null. */
export function inviteCodeFromPath(pathname: string): string | null {
  const [section, raw] = pathname.split("/").filter(Boolean);
  if (section !== INVITE_PATH.slice(1) || !raw) return null;
  try {
    return normalizeReferralCode(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

/**
 * The code in a Play Install Referrer string ("ref=K7QX2MA&utm_source=…",
 * sometimes still URL-encoded), or null.
 */
export function codeFromInstallReferrer(
  referrer: string | null | undefined,
): string | null {
  if (!referrer) return null;
  let text = referrer;
  try {
    text = decodeURIComponent(referrer);
  } catch {
    // keep the raw string
  }
  const params = new URLSearchParams(text.replace(/^\?/, ""));
  return normalizeReferralCode(params.get("ref"));
}

/** A stored invite entry, or null if it's missing, malformed or too old. */
export function inviteFromStored(
  stored: StoredTouch | undefined,
  now: number,
): { code: string; touchedAt: string; source: InviteSource } | null {
  if (!stored) return null;
  const code = normalizeReferralCode(stored.c);
  if (!code || !Number.isFinite(stored.t)) return null;
  if (stored.t < now - INVITE_WINDOW_DAYS * DAY_MS) return null;
  const source: InviteSource =
    stored.s === "typed" || stored.s === "install_referrer" ? stored.s : "link";
  return { code, touchedAt: new Date(stored.t).toISOString(), source };
}

/** The invite to bind from a touch map: an invite link or typed code first. */
export function pickInvite(
  map: StoredTouchMap,
  now: number,
): { code: string; touchedAt: string; source: InviteSource } | null {
  return (
    inviteFromStored(map[INVITE_KEY], now) ??
    inviteFromStored(map[GENERIC_KEY], now)
  );
}

/** The touch map without its invite entries (after a final bind answer). */
export function withoutInvites(map: StoredTouchMap): StoredTouchMap {
  const { [INVITE_KEY]: _i, [GENERIC_KEY]: _u, ...rest } = map;
  return rest;
}

/**
 * Whether a bind answer is final for this device: the invite should be
 * forgotten. Anything temporary (rate limit, program off, a server error)
 * keeps it for another try.
 */
export function isFinalBindResult(result: ReferralBindResult): boolean {
  return !["capture_off", "program_off", "rate_limited", "error"].includes(
    result,
  );
}

/**
 * The share text for an invite (WhatsApp first in Ghana), in the sharer's
 * language. Words live under `invite.*` of the core namespace.
 */
export function inviteShareMessage(
  t: CoreTranslator,
  input: {
    url: string;
    refereeMinor: number | null;
    minOrderMinor: number | null;
    currency: string;
  },
): string {
  if (!input.refereeMinor || input.refereeMinor <= 0) {
    return t("invite.share", { url: input.url });
  }
  const amount = formatCredit(input.refereeMinor, input.currency);
  return input.minOrderMinor
    ? t("invite.shareWithOfferMin", {
        url: input.url,
        amount,
        min: formatCredit(input.minOrderMinor, input.currency),
      })
    : t("invite.shareWithOffer", { url: input.url, amount });
}

/** What to tell the person after a bind attempt. */
export function bindResultMessage(
  t: CoreTranslator,
  outcome: ReferralBindOutcome,
): {
  tone: "success" | "info" | "error";
  text: string;
} {
  const name = outcome.referrerName;
  switch (outcome.result) {
    case "bound": {
      const joined = name
        ? t("invite.joinedWith", { name })
        : t("invite.joinedWithFriend");
      if (outcome.welcome === "granted" && outcome.welcomeMinor) {
        return {
          tone: "success",
          text: t("invite.welcomeReady", {
            joined,
            amount: formatCredit(outcome.welcomeMinor, outcome.currency),
          }),
        };
      }
      if (outcome.welcome === "needs_phone" && outcome.welcomeMinor) {
        return {
          tone: "success",
          text: t("invite.welcomeNeedsPhone", {
            joined,
            amount: formatCredit(outcome.welcomeMinor, outcome.currency),
          }),
        };
      }
      return { tone: "success", text: joined };
    }
    case "already_bound":
      return {
        tone: "info",
        text: name
          ? t("invite.alreadyBoundWith", { name })
          : t("invite.alreadyBound"),
      };
    case "own_code":
      return { tone: "error", text: t("invite.ownCode") };
    case "unknown_code":
      return { tone: "error", text: t("invite.unknownCode") };
    case "invalid":
      return { tone: "error", text: t("invite.invalid") };
    case "too_late":
      return { tone: "error", text: t("invite.tooLate") };
    case "not_new":
      return { tone: "error", text: t("invite.notNew") };
    case "circular":
      return { tone: "error", text: t("invite.circular") };
    case "referrer_restricted":
      return { tone: "error", text: t("invite.referrerRestricted") };
    case "rate_limited":
      return { tone: "error", text: t("invite.rateLimited") };
    case "capture_off":
    case "program_off":
      return { tone: "info", text: t("invite.unavailable") };
    default:
      return { tone: "error", text: t("invite.failed") };
  }
}
