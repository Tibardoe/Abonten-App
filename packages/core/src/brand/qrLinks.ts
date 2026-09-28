import { ANDROID_APP_LISTED, playStoreUrl } from "../rewards/invite";
import { PUBLIC_SITE_ORIGIN } from "./socialLinks";

// Short links for printed QR codes: abontenhub.com/go/<code>.
//
// A printed code cannot be changed once it is on a flyer, a sticker or a
// poster, so marketing pieces never point straight at a page. They point
// here, and the destination can move (to a proper organizer page, to the
// app store once the app is listed) without reprinting anything. The
// redirect is temporary (307) for the same reason, so no browser or
// scanner caches it. Each code also shows up on its own in the request
// logs, which is how scans of one piece are told from another.
//
// Codes are part of print artwork: never rename or delete one — point it
// somewhere else instead. An unknown code goes to the homepage, never a
// 404. Listing and event stickers use the listing's own address
// (/places/<slug>, /events/<code>); both are fixed when it is created.

export type QrLinkCode =
  | "discover"
  | "akwaaba"
  | "organizers"
  | "places"
  | "owner"
  | "tickets"
  | "app";

export type QrLink = {
  /** Site path the code sends people to. */
  destination: `/${string}`;
  /** Who holds the printed piece — for whoever re-points it later. */
  audience: string;
};

export const QR_LINKS: Readonly<Record<QrLinkCode, QrLink>> = {
  // Street, campus and venue flyers and posters.
  discover: {
    destination: "/",
    audience: "People in Ghana looking for something to do",
  },
  // Arrival-hall and hotel rack cards: visitors who just landed.
  akwaaba: { destination: "/", audience: "Visitors arriving in Ghana" },
  // No organizer landing page exists yet; the help article is the most
  // complete public "how to start" page.
  organizers: {
    destination: "/help/organizers/creating-and-publishing-events",
    audience: "Event organizers",
  },
  places: {
    destination: "/help/place-owners/managing-your-place",
    audience: "Owners of bars, restaurants, lounges and other places",
  },
  // The card left with an owner whose place was just published. Signed out,
  // the site asks them to sign in first and then opens their places.
  owner: {
    destination: "/manage/places",
    audience: "Owners whose place is live",
  },
  // Ticket-check signs at event entrances.
  tickets: {
    destination: "/help/customers/your-tickets",
    audience: "Ticket holders at an event entrance",
  },
  // "Get the app": the phone's own store once that listing is public
  // (APP_STORE_LISTINGS); until then, and on anything else, the website.
  app: {
    destination: "/",
    audience: "Anyone who scanned a Get-the-app code",
  },
};

/**
 * The app's public store listings, or null while it is not listed there.
 * Filling one in switches every printed "Get the app" code on that platform
 * to the store, with no reprint. Android follows ANDROID_APP_LISTED.
 */
export const APP_STORE_LISTINGS: Readonly<{
  ios: string | null;
  android: string | null;
}> = {
  ios: null,
  android: ANDROID_APP_LISTED ? playStoreUrl() : null,
};

export const QR_LINK_PREFIX = "/go";

/** The site path a short-link code sends people to (the homepage if unknown). */
export function qrLinkDestination(code: string): `/${string}` {
  const key = code.trim().toLowerCase();
  return Object.hasOwn(QR_LINKS, key)
    ? QR_LINKS[key as QrLinkCode].destination
    : "/";
}

/** The absolute URL to encode in a printed QR code. */
export function qrLinkUrl(
  code: QrLinkCode,
  origin: string = PUBLIC_SITE_ORIGIN,
): string {
  return `${origin.replace(/\/$/, "")}${QR_LINK_PREFIX}/${code}`;
}

/**
 * Where a scan of `code` should go: for `app`, the scanning phone's store
 * when that listing is public; otherwise the code's site path.
 */
export function qrLinkTarget(
  code: string,
  userAgent: string | null,
  listings: { ios: string | null; android: string | null } = APP_STORE_LISTINGS,
): string {
  const key = code.trim().toLowerCase();
  if (key === "app" && userAgent) {
    if (/iPhone|iPad|iPod/i.test(userAgent) && listings.ios)
      return listings.ios;
    if (/Android/i.test(userAgent) && listings.android) return listings.android;
  }
  return qrLinkDestination(key);
}
