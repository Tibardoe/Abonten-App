import { generateSlug } from "@abonten/core/geerateSlug";
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

export function eventShareUrl(eventCode: string): string {
  return `${SITE}/events/${generateSlug(eventCode) ?? ""}`;
}

export function placeShareUrl(slug: string): string {
  return `${SITE}/places/${slug}`;
}

export async function shareLink(title: string, url: string): Promise<void> {
  try {
    await Share.share({ message: `${title}\n${url}`, url, title });
  } catch {
    // User dismissed the sheet, or sharing is unavailable — nothing to do.
  }
}

export function shareEvent(title: string, eventCode: string): Promise<void> {
  return shareLink(title, eventShareUrl(eventCode));
}

export function sharePlace(title: string, slug: string): Promise<void> {
  return shareLink(title, placeShareUrl(slug));
}
