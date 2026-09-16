import { logger } from "@abonten/core/logger";
import {
  type ContentAudience,
  type ContentProgram,
  type ContentSettings,
  DISABLED_CONTENT_PROGRAM,
} from "@abonten/types/contentType";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";

// Programme switches for Spotlight + Stories. Same shape as Weekly,
// Discovery, Rewards and Verification: one settings row plus deploy-level
// env kill switches that win over it, the audience resolved here against the
// user id the transport already proved. Fails CLOSED: a kill switch, a
// missing row or a read error means nobody sees anything.

export type ContentSettingRow =
  Database["public"]["Tables"]["content_program_setting"]["Row"];

const SETTINGS_TTL_MS = 15_000;
let cached: { row: ContentSettingRow | null; at: number } | null = null;

/** Emergency stop for Spotlight: feeds, posting, campaigns, search section. */
export function isSpotlightKillSwitchOn(): boolean {
  return process.env.SPOTLIGHT_KILL_SWITCH === "true";
}

/**
 * Emergency stop for paid promotions only: no new promotions are sold and no
 * sponsored post is served. Organic Spotlight keeps working.
 */
export function isSpotlightPromotionsKillSwitchOn(): boolean {
  return process.env.SPOTLIGHT_PROMOTIONS_KILL_SWITCH === "true";
}

/** Emergency stop for Stories: tray, viewer, posting. */
export function isStoriesKillSwitchOn(): boolean {
  return process.env.STORIES_KILL_SWITCH === "true";
}

/** Test hook: forget the cached settings row. */
export function resetContentSettingsCache(): void {
  cached = null;
}

export async function readContentSettings(
  supabase: ServiceRoleClient,
  options: { fresh?: boolean } = {},
): Promise<ContentSettingRow | null> {
  if (!options.fresh && cached && Date.now() - cached.at < SETTINGS_TTL_MS) {
    return cached.row;
  }
  const { data, error } = await supabase
    .from("content_program_setting")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    logger.error(`readContentSettings failed: ${error.message}`);
    return null;
  }
  cached = { row: data ?? null, at: Date.now() };
  return data ?? null;
}

async function isStaff(
  supabase: ServiceRoleClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("admin_user")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.status === "active";
}

/** Pure audience rule, exported for tests. */
export async function contentAudienceIncludes(
  audience: string,
  betaUserIds: string[],
  userId: string | null,
  staffCheck: (userId: string) => Promise<boolean>,
): Promise<boolean> {
  if (audience === "all") return true;
  if (!userId) return false;
  if (audience === "beta" && betaUserIds.includes(userId)) return true;
  return staffCheck(userId);
}

export type ContentAccess = {
  program: ContentProgram;
  /** Null when the row could not be read (everything is then off). */
  settings: ContentSettingRow | null;
  /** True when the Spotlight answer does not depend on who is asking. */
  spotlightIsPublic: boolean;
};

/**
 * What one caller (or an anonymous visitor, userId null) may use. Publishing
 * needs a signed-in organizer, place owner or staff member; the database
 * re-checks that at publish time (content_publisher_eligible).
 */
export async function resolveContentAccess(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<ContentAccess> {
  const row = await readContentSettings(supabase);
  if (!row) {
    return {
      program: DISABLED_CONTENT_PROGRAM,
      settings: null,
      spotlightIsPublic: true,
    };
  }
  const staffCache = new Map<string, Promise<boolean>>();
  const staffCheck = (id: string) => {
    let p = staffCache.get(id);
    if (!p) {
      p = isStaff(supabase, id);
      staffCache.set(id, p);
    }
    return p;
  };
  const beta = row.beta_user_ids ?? [];

  const spotlight =
    !isSpotlightKillSwitchOn() &&
    row.spotlight_enabled &&
    (await contentAudienceIncludes(
      row.spotlight_audience,
      beta,
      userId,
      staffCheck,
    ));
  const stories =
    !isStoriesKillSwitchOn() &&
    row.stories_enabled &&
    (await contentAudienceIncludes(
      row.stories_audience,
      beta,
      userId,
      staffCheck,
    ));

  let canPublish = false;
  let publisherPlaces: ContentProgram["publisherPlaces"] = [];
  if (userId && (spotlight || stories)) {
    const [{ data: eligible }, { data: places }] = await Promise.all([
      supabase.rpc("content_publisher_eligible", {
        p_user_id: userId,
        p_publisher_kind: "organizer",
        p_publisher_place_id: null as unknown as string,
      }),
      supabase
        .from("place")
        .select("id, name, status, moderation_state, temporary_status")
        .eq("owner_id", userId)
        .eq("status", "published")
        .order("name"),
    ]);
    canPublish = eligible === true;
    publisherPlaces = (places ?? [])
      .filter(
        (p) =>
          !["hidden", "removed"].includes(p.moderation_state ?? "") &&
          p.temporary_status !== "permanently_closed",
      )
      .map((p) => ({ id: p.id, name: p.name }));
  }

  return {
    settings: row,
    spotlightIsPublic:
      row.spotlight_audience === "all" || !row.spotlight_enabled,
    program: {
      spotlight,
      spotlightPosting:
        spotlight && row.spotlight_posting_enabled && canPublish,
      spotlightComments: spotlight && row.spotlight_comments_enabled,
      spotlightDownloads: spotlight && row.spotlight_downloads_enabled,
      spotlightPromotions:
        spotlight &&
        row.spotlight_promotions_enabled &&
        !isSpotlightPromotionsKillSwitchOn() &&
        canPublish,
      nearby: spotlight && row.nearby_enabled,
      trending: spotlight && row.trending_enabled,
      happeningSoon: spotlight && row.happening_soon_enabled,
      stories,
      storiesPosting: stories && row.stories_posting_enabled && canPublish,
      storiesComments: stories && row.stories_comments_enabled,
      storiesReactions: stories && row.stories_reactions_enabled,
      storiesSharing: stories && row.stories_sharing_enabled,
      canPublish,
      publisherPlaces,
      storyTtlHours: row.story_ttl_hours,
      maxStoryItems: row.max_story_items,
      spotlightVideoMaxSeconds: row.spotlight_video_max_seconds,
      storyVideoMaxSeconds: row.story_video_max_seconds,
    },
  };
}

export async function getContentProgramCore(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<{ status: 200; data: ContentProgram }> {
  const { program } = await resolveContentAccess(supabase, userId);
  return { status: 200, data: program };
}

export function mapContentSettings(row: ContentSettingRow): ContentSettings {
  return {
    spotlightEnabled: row.spotlight_enabled,
    spotlightAudience: row.spotlight_audience as ContentAudience,
    spotlightPostingEnabled: row.spotlight_posting_enabled,
    spotlightCommentsEnabled: row.spotlight_comments_enabled,
    spotlightDownloadsEnabled: row.spotlight_downloads_enabled,
    spotlightPromotionsEnabled: row.spotlight_promotions_enabled,
    sponsoredDeliveryEnabled: row.sponsored_delivery_enabled,
    nearbyEnabled: row.nearby_enabled,
    trendingEnabled: row.trending_enabled,
    happeningSoonEnabled: row.happening_soon_enabled,
    creatorPostingEnabled: row.creator_posting_enabled,
    storiesEnabled: row.stories_enabled,
    storiesAudience: row.stories_audience as ContentAudience,
    storiesPostingEnabled: row.stories_posting_enabled,
    storiesCommentsEnabled: row.stories_comments_enabled,
    storiesReactionsEnabled: row.stories_reactions_enabled,
    storiesSharingEnabled: row.stories_sharing_enabled,
    storyTtlHours: row.story_ttl_hours,
    maxStoryItems: row.max_story_items,
    betaUserIds: row.beta_user_ids ?? [],
    spotlightPostsPerDay: row.spotlight_posts_per_day,
    storiesPerDay: row.stories_per_day,
    commentsPerHour: row.comments_per_hour,
    followsPerHour: row.follows_per_hour,
    spotlightVideoMaxSeconds: row.spotlight_video_max_seconds,
    storyVideoMaxSeconds: row.story_video_max_seconds,
    feedPageSize: row.feed_page_size,
    sponsoredMaxShareBps: row.sponsored_max_share_bps,
    sponsoredMinGap: row.sponsored_min_gap,
    sponsoredDailyCapPerViewer: row.sponsored_daily_cap_per_viewer,
    trendingWindowHours: row.trending_window_hours,
    nearbyDefaultRadiusKm: Number(row.nearby_default_radius_km),
    happeningSoonDays: row.happening_soon_days,
    rankWeightRecency: Number(row.rank_weight_recency),
    rankWeightEngagement: Number(row.rank_weight_engagement),
    rankWeightFollowing: Number(row.rank_weight_following),
    rankWeightProximity: Number(row.rank_weight_proximity),
    rankWeightUrgency: Number(row.rank_weight_urgency),
    rankSeenPenalty: Number(row.rank_seen_penalty),
    meaningfulViewMs: row.meaningful_view_ms,
    viewsPerViewerPerMinute: row.views_per_viewer_per_minute,
    expiredStoryRetentionDays: row.expired_story_retention_days,
    deletedPostRetentionDays: row.deleted_post_retention_days,
    rawViewRetentionDays: row.raw_view_retention_days,
    orphanMediaHours: row.orphan_media_hours,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}
