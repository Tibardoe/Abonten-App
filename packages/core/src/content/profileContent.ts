import type {
  ContentOwnPost,
  ContentPostDocument,
} from "@abonten/types/contentType";

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

export type SpotlightTile = {
  id: string;
  thumbnailUrl: string | null;
  isVideo: boolean;
  views: number;
  /** A short state label on your own tiles: Draft, Hidden, Removed, Limited. */
  badge: string | null;
  /** Where a tap goes: the player, or the manage screen for a draft. */
  href: string;
};

export function tileFromOwnPost(post: ContentOwnPost): SpotlightTile {
  const badge =
    post.moderationState === "removed"
      ? "Removed"
      : post.moderationState === "hidden"
        ? "Hidden"
        : post.status === "draft"
          ? "Draft"
          : post.moderationState === "restricted"
            ? "Limited"
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
