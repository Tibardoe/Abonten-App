// The share kit: ready-made images an organizer or a place owner posts to
// their own Instagram, TikTok or WhatsApp Status, so every listing they share
// also shows Abonten to their followers. The website draws the images
// (apps/web/src/app/api/share/...); this module decides, for every client,
// which images exist, where they are served and what an event's price line
// says.

import { eventPath, placePath, profilePath } from "../seo/paths";
import { FREE_TICKET_TYPE } from "../ticketTiers";

/** Pixel sizes of each image. Stories are 9:16, feed posts 4:5. */
export const SHARE_IMAGE_SIZES = {
  story: { width: 1080, height: 1920 },
  post: { width: 1080, height: 1350 },
  welcome: { width: 1080, height: 1350 },
} as const;

export type ShareImageFormat = keyof typeof SHARE_IMAGE_SIZES;
export type ShareSubjectKind = "events" | "places" | "profiles";

/** Which images each kind of listing has. */
export const SHARE_FORMATS: Record<
  ShareSubjectKind,
  readonly ShareImageFormat[]
> = {
  events: ["story", "post"],
  places: ["story", "post", "welcome"],
  profiles: ["welcome"],
};

export function isShareSubjectKind(value: unknown): value is ShareSubjectKind {
  return value === "events" || value === "places" || value === "profiles";
}

export function isShareFormatFor(
  kind: ShareSubjectKind,
  format: unknown,
): format is ShareImageFormat {
  return (SHARE_FORMATS[kind] as readonly unknown[]).includes(format);
}

/**
 * The address of one share image on the website. The key is the event code
 * (lower case, like every public link), the place slug or the username;
 * `locale` is the language the words are drawn in.
 */
export function shareImagePath(
  kind: ShareSubjectKind,
  key: string,
  format: ShareImageFormat,
  locale: string,
): string {
  const id = kind === "events" ? key.toLowerCase() : key;
  return `/api/share/${kind}/${encodeURIComponent(id)}/${format}?hl=${encodeURIComponent(locale)}`;
}

/** The public page an image points people to (and its QR code encodes). */
export function shareSubjectPath(kind: ShareSubjectKind, key: string): string {
  if (kind === "events") return eventPath(key);
  if (kind === "places") return placePath(key);
  return profilePath(key);
}

/** A file name for the downloaded image, e.g. "abonten-pilot-lounge-story.png". */
export function shareImageFileName(
  key: string,
  format: ShareImageFormat,
): string {
  const safe = key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `abonten-${safe || "listing"}-${format}.png`;
}

/**
 * Whether a listing has share images: only once it is public (published,
 * not hidden or removed by moderation, not a cancelled event). The image
 * route reads like the public pages, so anything else answers 404.
 */
export function hasShareImages(listing: {
  published_at?: string | null;
  status?: string | null;
  moderation_state?: string | null;
}): boolean {
  if (!listing.published_at) return false;
  if (listing.status === "canceled") return false;
  return (
    listing.moderation_state !== "hidden" &&
    listing.moderation_state !== "removed"
  );
}

export type ShareTier = {
  type: string | null;
  price: number | string | null;
  currency?: string | null;
};

/**
 * What an event offers, for the price line of its image: tickets from the
 * lowest paid price, free registration, or nothing on sale yet. The FREE
 * tier is decided by name, never by a price of 0 (see ticketTiers.ts).
 */
export type ShareOffer =
  | { kind: "tickets"; fromAmount: number; currency: string; single: boolean }
  | { kind: "free" }
  | { kind: "none" };

export function eventShareOffer(tiers: readonly ShareTier[]): ShareOffer {
  const paid = tiers
    .filter((t) => t.type !== FREE_TICKET_TYPE && t.currency)
    .map((t) => ({
      amount: Number(t.price ?? 0),
      currency: t.currency as string,
    }))
    .filter((t) => Number.isFinite(t.amount) && t.amount > 0);
  if (paid.length > 0) {
    const lowest = paid.reduce((a, b) => (b.amount < a.amount ? b : a));
    return {
      kind: "tickets",
      fromAmount: lowest.amount,
      currency: lowest.currency,
      single: paid.length === 1,
    };
  }
  if (tiers.some((t) => t.type === FREE_TICKET_TYPE)) return { kind: "free" };
  return { kind: "none" };
}

/**
 * Which call to action an event's offer gets on its image and in Abonten's
 * posts. A free event that asks nobody to register (`require_registration`
 * false: the page says "Free entry. No ticket or registration needed.") has
 * nothing to reserve on Abonten, so it gets the "See it on Abonten" action
 * of an event with nothing on sale; its price line still says "Free entry".
 */
export function eventShareAction(
  offer: ShareOffer,
  requireRegistration: boolean | null | undefined,
): ShareOffer["kind"] {
  if (offer.kind === "free" && requireRegistration === false) return "none";
  return offer.kind;
}
