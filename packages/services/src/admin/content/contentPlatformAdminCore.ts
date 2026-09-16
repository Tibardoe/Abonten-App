import { logger } from "@abonten/core/logger";
import {
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  ContentAdminCommentRow,
  ContentAdminOverview,
  ContentAdminPostRow,
  ContentKind,
  ContentPostDocument,
  ContentSettings,
} from "@abonten/types/contentType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { ContentSettingsInput } from "@abonten/validation/contentSchemas";
import {
  isSpotlightKillSwitchOn,
  isStoriesKillSwitchOn,
  mapContentSettings,
  readContentSettings,
  resetContentSettingsCache,
} from "../../content/contentProgram";
import { loadPostDocument } from "../../content/contentShared";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Admin › Spotlight: overview numbers, the post and comment queues, and the
// programme settings. Reads need spotlight.view; settings changes need
// spotlight.configure plus step-up (checked by the admin transport), a
// reason and the row's last updated_at (optimistic concurrency). Every
// change is audited field by field. Moderation actions themselves reuse
// applyModerationActionCore.

type RequestMeta = Record<string, unknown> | undefined;
const PAGE = 25;

const denied = <T>(e: unknown): AdminEnvelope<T> =>
  adminError(e) as AdminEnvelope<T>;

export async function getContentOverviewCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  range: { from: string; to: string },
): Promise<AdminEnvelope<ContentAdminOverview>> {
  try {
    assertPermission(ctx, "spotlight.view");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase.rpc("content_admin_overview", {
    p_from: range.from,
    p_to: range.to,
  });
  if (error) {
    logger.error(`content_admin_overview failed: ${error.message}`);
    return { status: 500, message: "Couldn't load the overview." };
  }
  return { status: 200, data: data as unknown as ContentAdminOverview };
}

// ── Settings ────────────────────────────────────────────────────────

export async function getContentSettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<
  AdminEnvelope<{
    settings: ContentSettings;
    killSwitches: { spotlight: boolean; stories: boolean };
  }>
> {
  try {
    assertPermission(ctx, "spotlight.view");
  } catch (e) {
    return denied(e);
  }
  const row = await readContentSettings(supabase, { fresh: true });
  if (!row) return { status: 500, message: "Couldn't load the settings." };
  return {
    status: 200,
    data: {
      settings: mapContentSettings(row),
      killSwitches: {
        spotlight: isSpotlightKillSwitchOn(),
        stories: isStoriesKillSwitchOn(),
      },
    },
  };
}

const COLUMN: Record<keyof ContentSettingsInput["patch"], string> = {
  spotlightEnabled: "spotlight_enabled",
  spotlightAudience: "spotlight_audience",
  spotlightPostingEnabled: "spotlight_posting_enabled",
  spotlightCommentsEnabled: "spotlight_comments_enabled",
  spotlightDownloadsEnabled: "spotlight_downloads_enabled",
  spotlightPromotionsEnabled: "spotlight_promotions_enabled",
  nearbyEnabled: "nearby_enabled",
  trendingEnabled: "trending_enabled",
  happeningSoonEnabled: "happening_soon_enabled",
  creatorPostingEnabled: "creator_posting_enabled",
  storiesEnabled: "stories_enabled",
  storiesAudience: "stories_audience",
  storiesPostingEnabled: "stories_posting_enabled",
  storiesCommentsEnabled: "stories_comments_enabled",
  storiesReactionsEnabled: "stories_reactions_enabled",
  storiesSharingEnabled: "stories_sharing_enabled",
  storyTtlHours: "story_ttl_hours",
  maxStoryItems: "max_story_items",
  betaUserIds: "beta_user_ids",
  spotlightPostsPerDay: "spotlight_posts_per_day",
  storiesPerDay: "stories_per_day",
  commentsPerHour: "comments_per_hour",
  followsPerHour: "follows_per_hour",
  spotlightVideoMaxSeconds: "spotlight_video_max_seconds",
  storyVideoMaxSeconds: "story_video_max_seconds",
  feedPageSize: "feed_page_size",
  sponsoredMaxShareBps: "sponsored_max_share_bps",
  sponsoredMinGap: "sponsored_min_gap",
  sponsoredDailyCapPerViewer: "sponsored_daily_cap_per_viewer",
  trendingWindowHours: "trending_window_hours",
  nearbyDefaultRadiusKm: "nearby_default_radius_km",
  happeningSoonDays: "happening_soon_days",
  rankWeightRecency: "rank_weight_recency",
  rankWeightEngagement: "rank_weight_engagement",
  rankWeightFollowing: "rank_weight_following",
  rankWeightProximity: "rank_weight_proximity",
  rankWeightUrgency: "rank_weight_urgency",
  rankSeenPenalty: "rank_seen_penalty",
  meaningfulViewMs: "meaningful_view_ms",
  viewsPerViewerPerMinute: "views_per_viewer_per_minute",
  expiredStoryRetentionDays: "expired_story_retention_days",
  deletedPostRetentionDays: "deleted_post_retention_days",
  rawViewRetentionDays: "raw_view_retention_days",
  orphanMediaHours: "orphan_media_hours",
};

export async function updateContentSettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: ContentSettingsInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<ContentSettings>> {
  try {
    assertPermission(ctx, "spotlight.configure");
  } catch (e) {
    return denied(e);
  }
  const beforeRow = await readContentSettings(supabase, { fresh: true });
  if (!beforeRow)
    return { status: 500, message: "Couldn't load the settings." };
  const before = mapContentSettings(beforeRow);

  const update: Record<string, unknown> = {};
  const changed: (keyof ContentSettings)[] = [];
  for (const [key, value] of Object.entries(input.patch)) {
    const column = COLUMN[key as keyof typeof COLUMN];
    if (!column || value === undefined) continue;
    if (
      JSON.stringify(before[key as keyof ContentSettings]) ===
      JSON.stringify(value)
    ) {
      continue;
    }
    update[column] = value;
    changed.push(key as keyof ContentSettings);
  }
  if (changed.length === 0) return { status: 400, message: "Nothing changed." };

  update.updated_at = new Date().toISOString();
  update.updated_by = ctx.userId;

  const { data, error } = await supabase
    .from("content_program_setting")
    .update(update as never)
    .eq("id", 1)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("*")
    .maybeSingle();
  if (error) {
    logger.error(`updateContentSettingsCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't save the settings." };
  }
  if (!data) {
    return {
      status: 409,
      message: "Someone else changed these settings. Reload and try again.",
    };
  }
  resetContentSettingsCache();
  const after = mapContentSettings(data);
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "spotlight.settings.update",
    targetType: "content_program_setting",
    targetId: "1",
    summary: `Spotlight & Stories settings changed: ${changed.join(", ")}`,
    reason: input.reason,
    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
    after: Object.fromEntries(changed.map((k) => [k, after[k]])),
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Settings saved.", data: after };
}

// ── Posts ───────────────────────────────────────────────────────────

export type AdminPostState =
  | "live"
  | "expired"
  | "reported"
  | "hidden"
  | "removed"
  | "restricted"
  | "any";

type Cursor = { createdAt: string; id: string };

export async function listContentPostsAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: {
    kind: ContentKind;
    state: AdminPostState;
    search?: string | null;
    cursor?: string | null;
  },
): Promise<
  AdminEnvelope<{
    rows: ContentAdminPostRow[];
    nextCursor: string | null;
    hasNextPage: boolean;
  }>
> {
  try {
    assertPermission(ctx, "spotlight.view");
  } catch (e) {
    return denied(e);
  }
  const cursor = decodeCursor<Cursor>(filters.cursor);
  let reportedIds: string[] | null = null;
  if (filters.state === "reported") {
    const { data: reps } = await supabase
      .from("report")
      .select("target_id")
      .eq("target_type", filters.kind)
      .in("status", ["new", "under_review", "awaiting_info", "escalated"])
      .limit(500);
    reportedIds = [...new Set((reps ?? []).map((r) => r.target_id))];
    if (reportedIds.length === 0) {
      return {
        status: 200,
        data: { rows: [], nextCursor: null, hasNextPage: false },
      };
    }
  }

  let query = supabase
    .from("content_post")
    .select(
      "id, kind, status, moderation_state, caption, author_id, publisher_kind, published_at, expires_at, created_at, like_count, reaction_count, comment_count, share_count, save_count, view_count, content_media!content_media_post_id_fkey(thumbnail_url, position, status)",
    )
    .eq("kind", filters.kind)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE + 1);
  const nowIso = new Date().toISOString();
  switch (filters.state) {
    case "live":
      query = query.eq("status", "published").eq("moderation_state", "visible");
      if (filters.kind === "story") query = query.gt("expires_at", nowIso);
      break;
    case "expired":
      query = query.eq("status", "published").lte("expires_at", nowIso);
      break;
    case "hidden":
    case "removed":
    case "restricted":
      query = query.eq("moderation_state", filters.state);
      break;
    case "reported":
      query = query.in("id", reportedIds ?? []);
      break;
    default:
      query = query.neq("status", "draft");
  }
  if (filters.search?.trim()) {
    const s = filters.search.trim().replace(/[%,()]/g, "");
    query = query.ilike("caption", `%${s}%`);
  }
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }
  const { data, error } = await query;
  if (error) {
    logger.error(`listContentPostsAdminCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't load posts." };
  }
  const { page, hasNextPage } = splitPage(data ?? [], PAGE);
  const ids = page.map((r) => r.id);
  const authorIds = [...new Set(page.map((r) => r.author_id))];
  const [reports, authors] = await Promise.all([
    ids.length
      ? supabase
          .from("report")
          .select("target_id")
          .eq("target_type", filters.kind)
          .in("target_id", ids)
      : Promise.resolve({ data: [] as { target_id: string }[] }),
    authorIds.length
      ? supabase
          .from("user_info")
          .select("id, username, full_name")
          .in("id", authorIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            username: string | null;
            full_name: string | null;
          }[],
        }),
  ]);
  const reportCount = new Map<string, number>();
  for (const r of reports.data ?? []) {
    reportCount.set(r.target_id, (reportCount.get(r.target_id) ?? 0) + 1);
  }
  const authorName = new Map(
    (authors.data ?? []).map((a) => [
      a.id,
      a.full_name ?? (a.username as string | null) ?? null,
    ]),
  );
  const rows: ContentAdminPostRow[] = page.map((r) => {
    const media = (r.content_media ?? [])
      .filter((m) => m.status !== "deleted")
      .sort((a, b) => a.position - b.position);
    return {
      id: r.id,
      kind: r.kind as ContentKind,
      status: r.status as ContentAdminPostRow["status"],
      moderationState:
        r.moderation_state as ContentAdminPostRow["moderationState"],
      caption: r.caption,
      authorId: r.author_id,
      authorName: authorName.get(r.author_id) ?? null,
      publisherKind: r.publisher_kind as ContentAdminPostRow["publisherKind"],
      publishedAt: r.published_at,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      thumbnailUrl: media[0]?.thumbnail_url ?? null,
      reportCount: reportCount.get(r.id) ?? 0,
      counts: {
        likes: r.like_count,
        reactions: r.reaction_count,
        comments: r.comment_count,
        shares: r.share_count,
        saves: r.save_count,
        views: r.view_count,
      },
    };
  });
  const last = page[page.length - 1];
  return {
    status: 200,
    data: {
      rows,
      hasNextPage,
      nextCursor:
        hasNextPage && last
          ? encodeCursor<Cursor>({ createdAt: last.created_at, id: last.id })
          : null,
    },
  };
}

/** One post for staff, in any state (the document ignores visibility for admins). */
export async function getContentPostAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  postId: string,
): Promise<
  AdminEnvelope<{
    post: ContentPostDocument;
    authorName: string | null;
    reportCount: number;
  }>
> {
  try {
    assertPermission(ctx, "spotlight.view");
  } catch (e) {
    return denied(e);
  }
  const { data: row } = await supabase
    .from("content_post")
    .select("id, author_id, kind")
    .eq("id", postId)
    .maybeSingle();
  if (!row) return { status: 404, message: "Post not found." };
  // Viewing as the author bypasses the public-visibility rule of the
  // document function, which is what a reviewer needs.
  const post = await loadPostDocument(supabase, row.author_id, postId);
  if (!post) return { status: 404, message: "Post not found." };
  const [{ data: author }, { count }] = await Promise.all([
    supabase
      .from("user_info")
      .select("username, full_name")
      .eq("id", row.author_id)
      .maybeSingle(),
    supabase
      .from("report")
      .select("id", { count: "exact", head: true })
      .eq("target_type", row.kind)
      .eq("target_id", postId),
  ]);
  return {
    status: 200,
    data: {
      post: { ...post, viewer: { ...post.viewer, isAuthor: false } },
      authorName:
        author?.full_name ?? (author?.username as string | null) ?? null,
      reportCount: count ?? 0,
    },
  };
}

// ── Comments ────────────────────────────────────────────────────────

export async function listContentCommentsAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: {
    state: "reported" | "hidden" | "removed" | "any";
    cursor?: string | null;
  },
): Promise<
  AdminEnvelope<{
    rows: ContentAdminCommentRow[];
    nextCursor: string | null;
    hasNextPage: boolean;
  }>
> {
  try {
    assertPermission(ctx, "spotlight.view");
  } catch (e) {
    return denied(e);
  }
  const cursor = decodeCursor<Cursor>(filters.cursor);
  let reportedIds: string[] | null = null;
  if (filters.state === "reported") {
    const { data: reps } = await supabase
      .from("report")
      .select("target_id")
      .eq("target_type", "content_comment")
      .in("status", ["new", "under_review", "awaiting_info", "escalated"])
      .limit(500);
    reportedIds = [...new Set((reps ?? []).map((r) => r.target_id))];
    if (reportedIds.length === 0) {
      return {
        status: 200,
        data: { rows: [], nextCursor: null, hasNextPage: false },
      };
    }
  }
  let query = supabase
    .from("content_comment")
    .select(
      "id, post_id, body, status, moderation_state, author_id, created_at",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE + 1);
  if (filters.state === "reported") query = query.in("id", reportedIds ?? []);
  else if (filters.state !== "any")
    query = query.eq("moderation_state", filters.state);
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }
  const { data, error } = await query;
  if (error) {
    logger.error(`listContentCommentsAdminCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't load comments." };
  }
  const { page, hasNextPage } = splitPage(data ?? [], PAGE);
  const ids = page.map((r) => r.id);
  const authorIds = [...new Set(page.map((r) => r.author_id))];
  const [reports, authors] = await Promise.all([
    ids.length
      ? supabase
          .from("report")
          .select("target_id")
          .eq("target_type", "content_comment")
          .in("target_id", ids)
      : Promise.resolve({ data: [] as { target_id: string }[] }),
    authorIds.length
      ? supabase
          .from("user_info")
          .select("id, username, full_name")
          .in("id", authorIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            username: string | null;
            full_name: string | null;
          }[],
        }),
  ]);
  const reportCount = new Map<string, number>();
  for (const r of reports.data ?? []) {
    reportCount.set(r.target_id, (reportCount.get(r.target_id) ?? 0) + 1);
  }
  const authorName = new Map(
    (authors.data ?? []).map((a) => [
      a.id,
      a.full_name ?? (a.username as string | null) ?? null,
    ]),
  );
  const rows: ContentAdminCommentRow[] = page.map((r) => ({
    id: r.id,
    postId: r.post_id,
    body: r.body,
    status: r.status as "visible" | "deleted",
    moderationState:
      r.moderation_state as ContentAdminCommentRow["moderationState"],
    authorId: r.author_id,
    authorName: authorName.get(r.author_id) ?? null,
    createdAt: r.created_at,
    reportCount: reportCount.get(r.id) ?? 0,
  }));
  const last = page[page.length - 1];
  return {
    status: 200,
    data: {
      rows,
      hasNextPage,
      nextCursor:
        hasNextPage && last
          ? encodeCursor<Cursor>({ createdAt: last.created_at, id: last.id })
          : null,
    },
  };
}
