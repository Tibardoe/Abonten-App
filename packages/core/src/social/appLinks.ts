import { PUBLIC_SITE_ORIGIN } from "../brand/socialLinks";
import { eventPath, placePath } from "../seo/paths";
import {
  LINK_SOURCE_PARAM,
  type LinkSource,
  normalizeLinkSource,
} from "./linkSources";

// Handing a listing from a link to the app
// (docs/architecture/social-distribution.md).
//
// Abonten posts each new event and place with its own address
// (abontenhub.com/events/<code>, /places/<slug>). A phone with the app opens
// the listing there (Universal Links / App Links); a phone without it shows
// the web page, which offers the app:
//   * Android: "Get the app" is /go/app?open=<path>&src=<code>. The Play
//     Store link it redirects to carries the same pair as its `referrer`,
//     which Google Play hands to the app on its first start (Play Install
//     Referrer), and the app opens that listing once.
//   * iPhone: the App Store has no referrer. Safari's Smart App Banner (the
//     page's apple-itunes-app tag) carries the page's address instead.
//
// Only an event or a place is ever opened this way, and only from a path of
// the exact shapes below: anything else is ignored, so the parameter can
// never send anyone to another page or another site.

/** The query parameter (and referrer key) naming the listing to open. */
export const APP_OPEN_PARAM = "open";

export type AppOpenTarget =
  | { kind: "event"; code: string; path: string }
  | { kind: "place"; slug: string; path: string };

// Event codes are letters and digits (eventCodeGenerator.ts: up to two
// initials and six characters; older ones four digits), in either case;
// links carry them in lower case.
const EVENT_CODE = /^[a-z0-9]{2,16}$/i;
// Place slugs are lower-case letters, digits, "-" and "_" (geerateSlug.ts
// plus a short id), with at least one letter or digit.
const PLACE_SLUG = /^(?=[a-z0-9_-]*[a-z0-9])[a-z0-9_-]{1,120}$/;

/**
 * The listing an `open` value names: "/events/<code>" or "/places/<slug>",
 * exactly (no query, no fragment, no other segment, no encoded character).
 * Null for anything else.
 */
export function appOpenTarget(value: unknown): AppOpenTarget | null {
  if (typeof value !== "string") return null;
  const match = /^\/(events|places)\/([^/]+)$/.exec(value);
  if (!match) return null;
  const [, section, segment] = match;
  if (section === "events") {
    if (!EVENT_CODE.test(segment)) return null;
    return { kind: "event", code: segment, path: eventPath(segment) };
  }
  if (!PLACE_SLUG.test(segment)) return null;
  return { kind: "place", slug: segment, path: placePath(segment) };
}

/**
 * The `open=<path>&src=<code>` pair, as a query string: the /go/app query
 * and the Play Store referrer are the same text.
 */
export function appOpenQuery(
  target: AppOpenTarget,
  source: LinkSource | null,
): string {
  const params = new URLSearchParams({ [APP_OPEN_PARAM]: target.path });
  if (source) params.set(LINK_SOURCE_PARAM, source);
  return params.toString();
}

/** A Play Store listing URL that hands `referrer` to the app on install. */
export function withInstallReferrer(
  storeUrl: string,
  referrer: string,
): string {
  const url = new URL(storeUrl);
  url.searchParams.set("referrer", referrer);
  return url.toString();
}

/**
 * The listing (and link source) in a Play Install Referrer string
 * ("open=%2Fevents%2Fab12cd34&src=ig", sometimes still URL-encoded once
 * more), or null. Friend invites read `ref` from the same string
 * (rewards/invite.ts codeFromInstallReferrer).
 */
export function appOpenFromInstallReferrer(
  referrer: string | null | undefined,
): { target: AppOpenTarget; source: LinkSource | null } | null {
  if (!referrer) return null;
  let text = referrer;
  try {
    text = decodeURIComponent(referrer);
  } catch {
    // keep the raw string
  }
  const params = new URLSearchParams(text.replace(/^\?/, ""));
  const target = appOpenTarget(params.get(APP_OPEN_PARAM));
  if (!target) return null;
  return {
    target,
    source: normalizeLinkSource(params.get(LINK_SOURCE_PARAM)),
  };
}

/** The numeric app id in an App Store listing URL (…/app/id6812440895). */
export function appStoreAppId(listingUrl: string | null): string | null {
  if (!listingUrl) return null;
  return /\/id(\d+)(?:[/?#]|$)/.exec(listingUrl)?.[1] ?? null;
}

/**
 * Safari's Smart App Banner for a public page: the App Store app and the
 * page's address, which the app opens after Get / Open. Null while the app
 * is not on the App Store.
 */
export function smartAppBanner(
  path: string,
  appStoreListing: string | null,
  origin: string = PUBLIC_SITE_ORIGIN,
): { appId: string; appArgument: string } | null {
  const appId = appStoreAppId(appStoreListing);
  if (!appId) return null;
  return { appId, appArgument: `${origin.replace(/\/$/, "")}${path}` };
}
