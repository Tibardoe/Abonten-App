import { generateSlug } from "@abonten/core/geerateSlug";
import { withReferralCode } from "@abonten/core/rewards/referralCode";
import { weeklyEditionPath } from "@abonten/core/weekly/copy";
import { Platform, Share } from "react-native";

// Native share — the mobile stand-in for the web share buttons. The web
// `getEventShareUrl` builds `${BASE_URL}/events/${slug(eventCode)}`; mobile
// has no NEXT_PUBLIC_BASE_URL, so the canonical website origin is inlined
// here.
//
// We deliberately share the URL as text (not a downloaded image file):
// WhatsApp / iMessage / X / etc. then unfurl it into a rich preview card
// from the Open Graph tags on the web event/place pages (see
// apps/web .../events/[eventCode]/page.tsx + places/[slug]/page.tsx). And
// Universal / App Links route the same https URL straight back into the app
// when it's installed (app/+native-intent.ts + app.json).
const SITE = "https://abontenhub.com";

/**
 * The public event link. With the signed-in sharer's referral code it gets
 * ?ref=CODE, so a ticket bought through it can earn them credit. Null when
 * the event has no usable code (a draft, or a row missing its code) — a
 * bare `/events/` link would open the site's 404.
 */
export function eventShareUrl(
  eventCode: string | null | undefined,
  referralCode?: string | null,
): string | null {
  const slug = eventCode ? generateSlug(eventCode) : null;
  if (!slug) return null;
  return withReferralCode(`${SITE}/events/${slug}`, referralCode ?? null);
}

export function placeShareUrl(slug: string): string {
  return `${SITE}/places/${slug}`;
}

/** The dated Abonten Weekly edition link (the edition's canonical address). */
export function weeklyShareUrl(scopeSlug: string, weekStart: string): string {
  return `${SITE}${weeklyEditionPath(scopeSlug, weekStart)}`;
}

/**
 * What happened to a share: the person shared it, closed the sheet (never
 * an error — nothing to report), or the share sheet could not be shown.
 * Android reports no outcome for a completed share; it resolves "shared"
 * once the chooser was shown, which is the most the platform tells us.
 */
export type ShareOutcome =
  | { kind: "shared" }
  | { kind: "dismissed" }
  | { kind: "failed"; message: string };

/** Opens the platform share sheet with the link. Never throws. */
export async function shareLink(
  title: string,
  url: string | null,
): Promise<ShareOutcome> {
  if (!url) {
    return { kind: "failed", message: "This link isn't available yet." };
  }
  try {
    const result = await Share.share(
      // iOS hands `message` and `url` to the share sheet as two items, and
      // targets that take both (Copy, Messages, WhatsApp) paste them
      // together — putting the link in the message as well produced
      // "Title https://… https://…". So on iOS the link travels only as
      // `url`. Android ignores `url`, so there it rides in the message.
      Platform.OS === "ios"
        ? { message: title, url, title }
        : { message: `${title}\n${url}`, title },
      { dialogTitle: title, subject: title },
    );
    return result.action === Share.dismissedAction
      ? { kind: "dismissed" }
      : { kind: "shared" };
  } catch (e) {
    return {
      kind: "failed",
      message:
        e instanceof Error && e.message
          ? e.message
          : "The share sheet couldn't be opened.",
    };
  }
}

export function shareEvent(
  title: string,
  eventCode: string | null | undefined,
  referralCode?: string | null,
): Promise<ShareOutcome> {
  return shareLink(title, eventShareUrl(eventCode, referralCode));
}
