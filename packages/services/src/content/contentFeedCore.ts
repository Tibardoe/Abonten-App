import {
  type SponsoredCandidate,
  mergeSponsored,
} from "@abonten/core/content/feedMerge";
import { logger } from "@abonten/core/logger";
import { decodeCursor, encodeCursor } from "@abonten/core/pagination";
import type {
  ContentFeedPage,
  ContentFeedSurface,
  ContentPostDocument,
} from "@abonten/types/contentType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { ContentFeedRequest } from "@abonten/validation/contentSchemas";
import { deriveSigningKey, hmacBase64Url } from "../security/signing";
import { resolveContentAccess } from "./contentProgram";
import { type Envelope, FAIL, loadPostDocuments } from "./contentShared";

// The Spotlight feed. Organic ranking happens in content_feed() (one SQL
// call, settings-driven weights); paid placements come from
// content_sponsored_candidates() and are merged here with the share and gap
// limits, so the feed can never become an advertisement wall. The cursor
// freezes `asOf` for the paging session so page 2 never reorders page 1.

type FeedCursor = { asOf: string; score: number; id: string; page: number };

/** Hash the device key so the raw install id is never stored. */
export function hashViewerKey(
  raw: string | null | undefined,
  fallback: string,
): string {
  const value = raw && raw.length >= 8 ? raw : fallback;
  return hmacBase64Url(deriveSigningKey("content-viewer"), value).slice(0, 40);
}

export async function getContentFeedCore(
  supabase: ServiceRoleClient,
  userId: string | null,
  input: ContentFeedRequest,
  context: { ip: string },
): Promise<Envelope<ContentFeedPage>> {
  const { program, settings } = await resolveContentAccess(supabase, userId);
  const surface = input.surface as ContentFeedSurface;
  if (!program.spotlight || !settings) {
    return { status: 403, message: "Spotlight isn't available yet." };
  }
  if (surface === "following" && !userId) {
    return { status: 401, message: "Sign in to see who you follow." };
  }
  if (
    surface === "nearby" &&
    (!program.nearby || input.lat == null || input.lng == null)
  ) {
    return { status: 400, message: "Nearby needs a location." };
  }
  if (surface === "trending" && !program.trending) {
    return { status: 403, message: "Trending isn't available yet." };
  }
  if (surface === "happening_soon" && !program.happeningSoon) {
    return { status: 403, message: "Happening soon isn't available yet." };
  }

  const cursor = decodeCursor<FeedCursor>(input.cursor);
  const asOf = cursor?.asOf ?? new Date().toISOString();
  const pageSize = settings.feed_page_size;

  const { data: ranked, error } = await supabase.rpc("content_feed", {
    p_viewer: (userId ?? null) as unknown as string,
    p_surface: surface,
    p_lat: (input.lat ?? null) as unknown as number,
    p_lng: (input.lng ?? null) as unknown as number,
    p_radius_km: (input.radiusKm ?? null) as unknown as number,
    p_as_of: asOf,
    p_cursor_score: (cursor?.score ?? null) as unknown as number,
    p_cursor_id: (cursor?.id ?? null) as unknown as string,
    p_limit: pageSize,
  });
  if (error) {
    logger.error(`content_feed failed: ${error.message}`);
    return FAIL;
  }
  const rows = ranked ?? [];
  const organic = await loadPostDocuments(
    supabase,
    userId,
    rows.map((r) => r.post_id),
  );

  let sponsored: SponsoredCandidate[] = [];
  if (
    program.spotlightPromotions !== undefined &&
    settings.spotlight_promotions_enabled &&
    organic.length > 0 &&
    (surface === "for_you" || surface === "nearby" || surface === "trending")
  ) {
    const viewerKey = hashViewerKey(input.viewerKey, `ip:${context.ip}`);
    const { data: cands, error: candError } = await supabase.rpc(
      "content_sponsored_candidates",
      {
        p_viewer: (userId ?? null) as unknown as string,
        p_viewer_key: viewerKey,
        p_lat: (input.lat ?? null) as unknown as number,
        p_lng: (input.lng ?? null) as unknown as number,
        p_limit: 3,
      },
    );
    if (candError) {
      logger.error(`content_sponsored_candidates failed: ${candError.message}`);
    } else if (cands && cands.length > 0) {
      const docs = await loadPostDocuments(
        supabase,
        userId,
        cands.map((c) => c.post_id),
      );
      const byId = new Map(docs.map((d) => [d.id, d]));
      sponsored = cands
        .map((c) => {
          const post = byId.get(c.post_id);
          return post ? { campaignId: c.campaign_id, post } : null;
        })
        .filter((c): c is SponsoredCandidate => c !== null);
    }
  }

  const items = mergeSponsored(organic, sponsored, {
    maxShareBps: settings.sponsored_max_share_bps,
    minGap: settings.sponsored_min_gap,
  });
  const last = rows[rows.length - 1];
  const hasNextPage = rows.length >= pageSize;
  return {
    status: 200,
    data: {
      surface,
      items,
      hasNextPage,
      nextCursor:
        hasNextPage && last
          ? encodeCursor<FeedCursor>({
              asOf,
              score: Number(last.score),
              id: last.post_id,
              page: (cursor?.page ?? 0) + 1,
            })
          : null,
    },
  };
}

export async function searchSpotlightCore(
  supabase: ServiceRoleClient,
  userId: string | null,
  query: string,
): Promise<Envelope<{ posts: ContentPostDocument[] }>> {
  const { program } = await resolveContentAccess(supabase, userId);
  if (!program.spotlight) return { status: 200, data: { posts: [] } };
  const { data, error } = await supabase.rpc("search_spotlight", {
    p_query: query,
    p_viewer: (userId ?? null) as unknown as string,
    p_limit: 20,
  });
  if (error) {
    logger.error(`search_spotlight failed: ${error.message}`);
    return FAIL;
  }
  const posts = await loadPostDocuments(
    supabase,
    userId,
    (data ?? []).map((r) => r.post_id),
  );
  return { status: 200, data: { posts } };
}

/** The viewer's saved Spotlights. */
export async function listSavedContentCore(
  supabase: ServiceRoleClient,
  userId: string,
  cursor?: string | null,
): Promise<
  Envelope<{
    posts: ContentPostDocument[];
    nextCursor: string | null;
    hasNextPage: boolean;
  }>
> {
  const c = decodeCursor<{ createdAt: string; id: string }>(cursor);
  let query = supabase
    .from("content_save")
    .select("post_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("post_id", { ascending: false })
    .limit(13);
  if (c) {
    query = query.or(
      `created_at.lt.${c.createdAt},and(created_at.eq.${c.createdAt},post_id.lt.${c.id})`,
    );
  }
  const { data, error } = await query;
  if (error) {
    logger.error(`listSavedContentCore failed: ${error.message}`);
    return FAIL;
  }
  const rows = data ?? [];
  const hasNextPage = rows.length > 12;
  const page = hasNextPage ? rows.slice(0, 12) : rows;
  const posts = await loadPostDocuments(
    supabase,
    userId,
    page.map((r) => r.post_id),
  );
  const last = page[page.length - 1];
  return {
    status: 200,
    data: {
      posts,
      hasNextPage,
      nextCursor:
        hasNextPage && last
          ? encodeCursor({ createdAt: last.created_at, id: last.post_id })
          : null,
    },
  };
}
