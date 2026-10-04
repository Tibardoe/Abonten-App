import { SUPPORT_EMAIL, mailto } from "@abonten/core/brand/contacts";
import {
  HELP_PATH,
  LEGAL_PATHS,
  PUBLIC_SITE_ORIGIN,
} from "@abonten/core/brand/socialLinks";
import { getCurrentLocale } from "@abonten/ui-native/i18n";
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

/**
 * `label` is a key of the `common` catalog; the drawer translates it with a
 * translator of that catalog (with the drawer's own, `navigation`, the menu
 * read "navigation.termsConditions").
 */
export const LEGAL_LINK_ROWS = [
  { label: "termsConditions", url: LEGAL_URLS.terms },
  { label: "privacy", url: LEGAL_URLS.privacy },
  { label: "cookies", url: LEGAL_URLS.cookies },
  { label: "security", url: LEGAL_URLS.security },
] as const;

/**
 * Our own pages open in the app's language, not the phone's: the in-app
 * browser sends the phone's language and keeps its own cookies, so the link
 * names the language (`?hl=`, read by the website's proxy).
 */
export function inAppLanguage(url: string): string {
  if (!url.startsWith(`${PUBLIC_SITE_ORIGIN}/`) && url !== PUBLIC_SITE_ORIGIN)
    return url;
  if (/[?&]hl=/.test(url)) return url;
  const [base, hash] = url.split("#", 2);
  const joined = `${base}${base.includes("?") ? "&" : "?"}hl=${encodeURIComponent(getCurrentLocale())}`;
  return hash === undefined ? joined : `${joined}#${hash}`;
}

export async function openExternalLink(url: string): Promise<void> {
  const target = inAppLanguage(url);
  try {
    await WebBrowser.openBrowserAsync(target);
  } catch {
    await Linking.openURL(target).catch(() => {});
  }
}

/** Opens the device mail app addressed to the official support mailbox. */
export async function openSupportEmail(subject?: string): Promise<void> {
  await Linking.openURL(mailto(SUPPORT_EMAIL, subject)).catch(() => {});
}
