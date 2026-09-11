import { generateSlug } from "@abonten/core/geerateSlug";
import { withReferralCode } from "@abonten/core/rewards/referralCode";
import { Share } from "react-native";

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
 * ?ref=CODE, so a ticket bought through it can earn them credit.
 */
export function eventShareUrl(
  eventCode: string,
  referralCode?: string | null,
): string {
  return withReferralCode(
    `${SITE}/events/${generateSlug(eventCode) ?? ""}`,
    referralCode ?? null,
  );
}

export function placeShareUrl(slug: string): string {
  return `${SITE}/places/${slug}`;
}

/** Opens the share sheet; resolves true when the user actually shared. */
export async function shareLink(title: string, url: string): Promise<boolean> {
  try {
    const result = await Share.share({
      message: `${title}\n${url}`,
      url,
      title,
    });
    return result.action === Share.sharedAction;
  } catch {
    // User dismissed the sheet, or sharing is unavailable — nothing to do.
    return false;
  }
}

export function shareEvent(
  title: string,
  eventCode: string,
  referralCode?: string | null,
): Promise<boolean> {
  return shareLink(title, eventShareUrl(eventCode, referralCode));
}

export function sharePlace(title: string, slug: string): Promise<boolean> {
  return shareLink(title, placeShareUrl(slug));
}
