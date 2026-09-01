import { generateSlug } from "@abonten/core/geerateSlug";
import { Share } from "react-native";

// Native share — the mobile stand-in for the web share buttons. The web
// `getEventShareUrl` builds `${BASE_URL}/events/${slug(eventCode)}`; mobile
// has no NEXT_PUBLIC_BASE_URL, so the canonical website origin is inlined
// here (same value as AppMenuSheet's WEBSITE), and the deep link resolves
// on the web until native universal links are set up.
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
