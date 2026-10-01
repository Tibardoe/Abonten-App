import type {
  ContentOwnPost,
  ContentPostDocument,
} from "@abonten/types/contentType";
import type { CoreTranslator } from "../i18n/translator";

// What a profile's content area offers, and to whom. Shared rules so the
// mobile profile (and any later web port) cannot drift into showing
// someone else's drafts or saved list.

export type ProfileTab = "listings" | "spotlights" | "favorites" | "reviews";
export type ListingKind = "events" | "places";
export type SpotlightSegment = "published" | "saved" | "drafts";

/** The tab row. Favourites are private; Spotlights follow the programme. */
export function profileTabs(opts: {
  isOwn: boolean;
  spotlightOn: boolean;
}): ProfileTab[] {
  return [
    "listings",
    ...(opts.spotlightOn ? (["spotlights"] as const) : []),
    ...(opts.isOwn ? (["favorites"] as const) : []),
    "reviews",
  ];
}

/**
 * The Spotlights segments. Saved and Drafts exist only on your own profile;
 * on anyone else's there is a single published grid (no segment control).
 */
export function spotlightSegments(isOwn: boolean): SpotlightSegment[] {
  return isOwn ? ["published", "saved", "drafts"] : ["published"];
}

export type SpotlightBadge = "removed" | "hidden" | "draft" | "limited";

/** "Draft", "Hidden", "Removed", "Limited" in the reader's language. */
export function spotlightBadgeLabel(
  t: CoreTranslator,
  badge: SpotlightBadge,
): string {
  return t(`spotlightBadge.${badge}`);
}

export type SpotlightTile = {
  id: string;
  thumbnailUrl: string | null;
  isVideo: boolean;
  views: number;
  /** The state marked on your own tiles; spotlightBadgeLabel() words it. */
  badge: SpotlightBadge | null;
  /** Where a tap goes: the player, or the manage screen for a draft. */
  href: string;
};

export function tileFromOwnPost(post: ContentOwnPost): SpotlightTile {
  const badge: SpotlightBadge | null =
    post.moderationState === "removed"
      ? "removed"
      : post.moderationState === "hidden"
        ? "hidden"
        : post.status === "draft"
          ? "draft"
          : post.moderationState === "restricted"
            ? "limited"
            : null;
  const playable =
    post.status === "published" &&
    (post.moderationState === "visible" ||
      post.moderationState === "restricted");
  return {
    id: post.id,
    thumbnailUrl: post.cover
      ? (post.cover.thumbnailUrl ??
        (post.cover.type === "image" ? post.cover.mediaUrl : null))
      : null,
    isVideo: post.cover?.type === "video",
    views: post.counts.views,
    badge,
    href: playable
      ? `/(app)/spotlight/${post.id}`
      : `/(app)/spotlight/post/${post.id}`,
  };
}

export function tileFromDocument(post: ContentPostDocument): SpotlightTile {
  const m = post.media[0];
  return {
    id: post.id,
    thumbnailUrl:
      m?.type === "video"
        ? (m.thumbnailUrl ?? m.posterUrl ?? null)
        : (m?.thumbnailUrl ?? m?.mediaUrl ?? null),
    isVideo: m?.type === "video",
    views: post.counts.views,
    badge: null,
    href: `/(app)/spotlight/${post.id}`,
  };
}

/** Rows of `size` for a grid inside a single-column list. */
export function chunkRows<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}
