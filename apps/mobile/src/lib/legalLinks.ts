import { SUPPORT_EMAIL, mailto } from "@abonten/core/brand/contacts";
import {
  HELP_PATH,
  LEGAL_PATHS,
  PUBLIC_SITE_ORIGIN,
} from "@abonten/core/brand/socialLinks";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";

// The public policies and the help centre live on the website; the app
// opens them in the in-app browser (the same convention FileAttachmentCard
// uses for attachments), falling back to the system browser if that fails.
// URLs are built from the canonical origin so the app can never point at a
// stale domain again (the sign-in screen used to link to abonten.com/terms,
// a route that never existed).

export const LEGAL_URLS = {
  terms: `${PUBLIC_SITE_ORIGIN}${LEGAL_PATHS.terms}`,
  privacy: `${PUBLIC_SITE_ORIGIN}${LEGAL_PATHS.privacy}`,
  cookies: `${PUBLIC_SITE_ORIGIN}${LEGAL_PATHS.cookies}`,
  security: `${PUBLIC_SITE_ORIGIN}${LEGAL_PATHS.security}`,
} as const;

export const HELP_URL = `${PUBLIC_SITE_ORIGIN}${HELP_PATH}`;

export const LEGAL_LINK_ROWS: { label: string; url: string }[] = [
  { label: "Terms & Conditions", url: LEGAL_URLS.terms },
  { label: "Privacy", url: LEGAL_URLS.privacy },
  { label: "Cookies", url: LEGAL_URLS.cookies },
  { label: "Security", url: LEGAL_URLS.security },
];

export async function openExternalLink(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url).catch(() => {});
  }
}

/** Opens the device mail app addressed to the official support mailbox. */
export async function openSupportEmail(subject?: string): Promise<void> {
  await Linking.openURL(mailto(SUPPORT_EMAIL, subject)).catch(() => {});
}
