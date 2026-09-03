import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { generateSlug } from "@abonten/core/geerateSlug";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Share } from "react-native";

// Native share — the mobile stand-in for the web share buttons. The web
// `getEventShareUrl` builds `${BASE_URL}/events/${slug(eventCode)}`; mobile
// has no NEXT_PUBLIC_BASE_URL, so the canonical website origin is inlined
// here. Universal / App Links now route these https URLs straight back into
// the app when it's installed (see app/+native-intent.ts + app.json).
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

// Shares the link with the flyer/cover image attached via the OS share sheet
// (WhatsApp, Messages, …). Falls back to the plain text+link share if the
// image can't be fetched or expo-sharing isn't available.
export async function shareLinkWithImage(
  title: string,
  url: string,
  imagePublicId: string | null | undefined,
  imageVersion: string | null | undefined,
): Promise<void> {
  if (!imagePublicId || !imageVersion || !(await Sharing.isAvailableAsync())) {
    return shareLink(title, url);
  }
  try {
    const remote = buildCloudinaryUrl(imagePublicId, imageVersion, {
      width: 1200,
    });
    const dest = new File(Paths.cache, `share-${Date.now()}.jpg`);
    if (dest.exists) dest.delete();
    await File.downloadFileAsync(remote, dest);
    await Sharing.shareAsync(dest.uri, {
      mimeType: "image/jpeg",
      UTI: "public.jpeg",
      dialogTitle: `${title}\n${url}`,
    });
  } catch {
    await shareLink(title, url);
  }
}

export function shareEventWithImage(
  title: string,
  eventCode: string,
  flyerPublicId: string | null | undefined,
  flyerVersion: string | null | undefined,
): Promise<void> {
  return shareLinkWithImage(
    title,
    eventShareUrl(eventCode),
    flyerPublicId,
    flyerVersion,
  );
}

export function sharePlaceWithImage(
  title: string,
  slug: string,
  coverPublicId: string | null | undefined,
  coverVersion: string | null | undefined,
): Promise<void> {
  return shareLinkWithImage(
    title,
    placeShareUrl(slug),
    coverPublicId,
    coverVersion,
  );
}
