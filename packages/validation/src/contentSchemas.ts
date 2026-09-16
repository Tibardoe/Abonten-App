import { CAMPAIGN_OBJECTIVES, FEED_SURFACES } from "@abonten/core/content/copy";
import {
  MAX_CAPTION_LENGTH,
  MAX_COMMENT_LENGTH,
} from "@abonten/core/content/limits";
import { CONTENT_REACTIONS } from "@abonten/core/content/reactions";
import { z } from "zod";

// Spotlight + Stories inputs, shared by the web Server Actions, the
// /api/mobile/content/** routes and the admin console. Lengths mirror the
// CHECK constraints in the 20260916120000..120200 migrations so a request is
// refused here with a readable message before the database would refuse it.

const uuid = z.string().uuid("Invalid id");

const optionalNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().finite().min(min).max(max).optional(),
  );

const optionalString = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.string().optional(),
);

export const contentKindSchema = z.enum(["spotlight", "story"]);
export const contentFeedSurfaceSchema = z.enum(
  FEED_SURFACES as unknown as [string, ...string[]],
);
export const contentReactionSchema = z.enum(
  CONTENT_REACTIONS as unknown as [string, ...string[]],
);

const publisher = z
  .object({
    kind: z.enum(["organizer", "place", "abonten"]).default("organizer"),
    placeId: uuid.optional().nullable(),
  })
  .refine((p) => p.kind !== "place" || !!p.placeId, {
    message: "Choose which place is posting",
    path: ["placeId"],
  });

// ── Media ────────────────────────────────────────────────────────────

/** What the client learned from Cloudinary's upload response. Only the
 *  public id is trusted; everything else is re-read from Cloudinary. */
export const registerContentMediaSchema = z.object({
  kind: contentKindSchema,
  publicId: z
    .string()
    .min(3)
    .max(200)
    .regex(/^[a-z0-9_/-]+$/i, "Invalid media reference"),
  resourceType: z.enum(["image", "video"]),
  version: z.number().int().positive(),
  trimStartSeconds: optionalNumber(0, 3600),
  trimEndSeconds: optionalNumber(0, 3600),
});
export type RegisterContentMediaInput = z.infer<
  typeof registerContentMediaSchema
>;

// ── Posts ────────────────────────────────────────────────────────────

const captionField = z
  .string()
  .trim()
  .max(
    MAX_CAPTION_LENGTH,
    `Keep the caption under ${MAX_CAPTION_LENGTH} characters`,
  )
  .optional()
  .nullable();

export const createContentPostSchema = z.object({
  kind: contentKindSchema,
  publisher: publisher.default({ kind: "organizer", placeId: null }),
  mediaIds: z.array(uuid).min(1, "Add at least one photo or video").max(20),
  caption: captionField,
  hashtags: z.array(z.string().max(31)).max(15).default([]),
  eventId: uuid.optional().nullable(),
  placeId: uuid.optional().nullable(),
  category: optionalString,
  allowComments: z.boolean().default(true),
  allowDownload: z.boolean().default(false),
  rightsAcknowledged: z.literal(true, {
    errorMap: () => ({ message: "Confirm you have the rights to share this" }),
  }),
  /** Publish now (default) or keep as a draft. */
  publish: z.boolean().default(true),
  /** Retries with the same id return the same post. */
  clientRequestId: uuid.optional(),
});
export type CreateContentPostInput = z.infer<typeof createContentPostSchema>;

export const updateContentPostSchema = z.object({
  postId: uuid,
  patch: z
    .object({
      caption: captionField,
      hashtags: z.array(z.string().max(31)).max(15),
      eventId: uuid.nullable(),
      placeId: uuid.nullable(),
      allowComments: z.boolean(),
      allowDownload: z.boolean(),
    })
    .strict()
    .partial(),
});
export type UpdateContentPostInput = z.infer<typeof updateContentPostSchema>;

export const contentPostIdSchema = z.object({ postId: uuid });

export const contentFeedRequestSchema = z.object({
  surface: contentFeedSurfaceSchema.default("for_you"),
  cursor: optionalString,
  lat: optionalNumber(-90, 90),
  lng: optionalNumber(-180, 180),
  radiusKm: optionalNumber(1, 200),
  /** Stable per-device key for sponsored frequency caps (hashed server-side). */
  viewerKey: optionalString,
});
export type ContentFeedRequest = z.infer<typeof contentFeedRequestSchema>;

export const publisherPostsRequestSchema = z.object({
  publisherKind: z.enum(["organizer", "place"]),
  publisherId: uuid,
  kind: contentKindSchema.default("spotlight"),
  cursor: optionalString,
});

export const contentSearchRequestSchema = z.object({
  q: z.string().trim().min(1).max(100),
});

// ── Engagement ───────────────────────────────────────────────────────

export const contentLikeSchema = z.object({
  postId: uuid,
  liked: z.boolean(),
});

export const contentSaveSchema = z.object({
  postId: uuid,
  saved: z.boolean(),
});

export const contentReactSchema = z.object({
  postId: uuid,
  /** Null removes the reaction. */
  emoji: contentReactionSchema.nullable(),
});

export const contentShareSchema = z.object({
  postId: uuid,
  channel: z
    .enum([
      "native",
      "whatsapp",
      "instagram",
      "facebook",
      "x",
      "copy_link",
      "internal",
      "other",
    ])
    .default("native"),
});

export const contentNotInterestedSchema = z.object({
  postId: uuid,
  notInterested: z.boolean().default(true),
});

export const contentMuteSchema = z.object({
  publisherKind: z.enum(["organizer", "place", "abonten"]),
  publisherId: uuid,
  muted: z.boolean(),
});

export const contentCommentsRequestSchema = z.object({
  postId: uuid,
  parentId: uuid.optional().nullable(),
  cursor: optionalString,
});

export const createContentCommentSchema = z.object({
  postId: uuid,
  parentId: uuid.optional().nullable(),
  body: z
    .string()
    .trim()
    .min(1, "Write something first")
    .max(MAX_COMMENT_LENGTH, `Keep it under ${MAX_COMMENT_LENGTH} characters`),
});

export const contentCommentIdSchema = z.object({ commentId: uuid });

export const contentCommentLikeSchema = z.object({
  commentId: uuid,
  liked: z.boolean(),
});

// ── Follow ───────────────────────────────────────────────────────────

export const followSchema = z.object({
  targetKind: z.enum(["organizer", "place"]),
  targetId: uuid,
  following: z.boolean(),
});

export const followStatusSchema = z.object({
  targetKind: z.enum(["organizer", "place"]),
  targetId: uuid,
});

// ── Stories ──────────────────────────────────────────────────────────

export const storySequenceRequestSchema = z.object({
  publisherKind: z.enum(["organizer", "place", "abonten"]),
  publisherId: uuid,
});

// ── Telemetry ────────────────────────────────────────────────────────

export const contentViewBatchSchema = z.object({
  viewerKey: z.string().min(8).max(200),
  events: z
    .array(
      z.object({
        postId: uuid,
        kind: z.enum([
          "impression",
          "view_start",
          "meaningful_view",
          "completion",
          "replay",
        ]),
        watchedMs: z.number().int().min(0).max(86_400_000).default(0),
        surface: z
          .enum([
            "for_you",
            "following",
            "nearby",
            "happening_soon",
            "trending",
            "stories",
            "profile",
            "deep_link",
            "search",
            "embed",
          ])
          .default("for_you"),
        campaignId: uuid.optional().nullable(),
      }),
    )
    .min(1)
    .max(100),
});
export type ContentViewBatchInput = z.infer<typeof contentViewBatchSchema>;

export const contentClickSchema = z.object({
  viewerKey: z.string().min(8).max(200),
  postId: uuid,
  kind: z.enum(["profile", "event", "place", "ticket", "cta", "hashtag"]),
  campaignId: uuid.optional().nullable(),
});

export const contentInsightsRequestSchema = z.object({
  postId: uuid,
  days: optionalNumber(1, 365),
});

// ── Campaigns (advertiser) ───────────────────────────────────────────

export const RADIUS_OPTIONS_KM = [5, 10, 25, 50] as const;

// Where a promotion is shown. "near_post" uses the Spotlight's own location
// (its event or place), read on the server — the client never sends
// coordinates for targeting.
export const promotionTargetingSchema = z
  .discriminatedUnion("area", [
    z.object({ area: z.literal("everywhere") }),
    z.object({
      area: z.literal("near_post"),
      radiusKm: z
        .number()
        .int()
        .refine((n) => (RADIUS_OPTIONS_KM as readonly number[]).includes(n), {
          message: "Choose a distance.",
        }),
    }),
  ])
  .default({ area: "everywhere" });

export const estimateContentPromotionSchema = z.object({
  postId: uuid,
  budgetMinor: z.number().int().positive().max(100_000_000),
  durationDays: z.number().int().min(1).max(60),
  targeting: promotionTargetingSchema,
});
export type EstimateContentPromotionInput = z.infer<
  typeof estimateContentPromotionSchema
>;

export const createContentCampaignSchema =
  estimateContentPromotionSchema.extend({
    objective: z.enum(CAMPAIGN_OBJECTIVES as unknown as [string, ...string[]]),
    startsAt: z.string().datetime({ offset: true }),
  });
export type CreateContentCampaignInput = z.infer<
  typeof createContentCampaignSchema
>;

export const contentCampaignIdSchema = z.object({ campaignId: uuid });

export const advertiserCampaignActionSchema = z.object({
  campaignId: uuid,
  action: z.enum(["pause", "resume", "cancel"]),
  reason: z.string().trim().max(500).optional(),
});

// ── Admin ────────────────────────────────────────────────────────────

const reason = z
  .string()
  .trim()
  .min(5, "Give a short reason for this change")
  .max(500);

export const contentSettingsSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  reason,
  patch: z
    .object({
      spotlightEnabled: z.boolean(),
      spotlightAudience: z.enum(["staff", "beta", "all"]),
      spotlightPostingEnabled: z.boolean(),
      spotlightCommentsEnabled: z.boolean(),
      spotlightDownloadsEnabled: z.boolean(),
      spotlightPromotionsEnabled: z.boolean(),
      sponsoredDeliveryEnabled: z.boolean(),
      nearbyEnabled: z.boolean(),
      trendingEnabled: z.boolean(),
      happeningSoonEnabled: z.boolean(),
      creatorPostingEnabled: z.boolean(),
      storiesEnabled: z.boolean(),
      storiesAudience: z.enum(["staff", "beta", "all"]),
      storiesPostingEnabled: z.boolean(),
      storiesCommentsEnabled: z.boolean(),
      storiesReactionsEnabled: z.boolean(),
      storiesSharingEnabled: z.boolean(),
      storyTtlHours: z.number().int().min(1).max(168),
      maxStoryItems: z.number().int().min(1).max(20),
      betaUserIds: z.array(uuid).max(500),
      spotlightPostsPerDay: z.number().int().min(1).max(200),
      storiesPerDay: z.number().int().min(1).max(200),
      commentsPerHour: z.number().int().min(1).max(600),
      followsPerHour: z.number().int().min(1).max(1000),
      spotlightVideoMaxSeconds: z.number().int().min(5).max(600),
      storyVideoMaxSeconds: z.number().int().min(5).max(300),
      feedPageSize: z.number().int().min(3).max(30),
      sponsoredMaxShareBps: z.number().int().min(0).max(5000),
      sponsoredMinGap: z.number().int().min(1).max(20),
      sponsoredDailyCapPerViewer: z.number().int().min(0).max(50),
      trendingWindowHours: z.number().int().min(6).max(720),
      nearbyDefaultRadiusKm: z.number().min(1).max(200),
      happeningSoonDays: z.number().int().min(1).max(60),
      rankWeightRecency: z.number().min(0).max(10),
      rankWeightEngagement: z.number().min(0).max(10),
      rankWeightFollowing: z.number().min(0).max(10),
      rankWeightProximity: z.number().min(0).max(10),
      rankWeightUrgency: z.number().min(0).max(10),
      rankSeenPenalty: z.number().min(0).max(1),
      meaningfulViewMs: z.number().int().min(500).max(30000),
      viewsPerViewerPerMinute: z.number().int().min(10).max(2000),
      expiredStoryRetentionDays: z.number().int().min(1).max(365),
      deletedPostRetentionDays: z.number().int().min(1).max(365),
      rawViewRetentionDays: z.number().int().min(7).max(730),
      orphanMediaHours: z.number().int().min(1).max(168),
    })
    .strict()
    .partial(),
});
export type ContentSettingsInput = z.infer<typeof contentSettingsSchema>;

export const adminContentPostsSchema = z.object({
  kind: contentKindSchema.default("spotlight"),
  state: z
    .enum([
      "live",
      "expired",
      "reported",
      "hidden",
      "removed",
      "restricted",
      "any",
    ])
    .default("live"),
  search: optionalString,
  cursor: optionalString,
});

export const adminContentCommentsSchema = z.object({
  state: z.enum(["reported", "hidden", "removed", "any"]).default("reported"),
  cursor: optionalString,
});

export const adminCampaignsSchema = z.object({
  status: z
    .enum([
      "pending_review",
      "scheduled",
      "active",
      "paused",
      "completed",
      "rejected",
      "cancelled",
      "refunded",
      "any",
    ])
    .default("pending_review"),
  cursor: optionalString,
});

export const adminCampaignActionSchema = z.object({
  campaignId: uuid,
  expectedVersion: z.number().int().min(1),
  action: z.enum(["approve", "reject", "pause", "resume", "cancel"]),
  reason: z.string().trim().max(500).optional(),
});
export type AdminCampaignActionInput = z.infer<
  typeof adminCampaignActionSchema
>;

const bps = z.number().int().min(0).max(10000);
const minor = z.number().int().min(1).max(10_000_000);

export const promotionPricingSchema = z.object({
  expectedVersion: z.number().int().min(1),
  reason,
  patch: z
    .object({
      minBudgetMinor: minor,
      maxBudgetMinor: minor,
      budgetStepMinor: z.number().int().min(1).max(100_000),
      suggestedBudgetsMinor: z.array(minor).min(1).max(6),
      durationOptionsDays: z
        .array(z.number().int().min(1).max(60))
        .min(1)
        .max(6),
      defaultDurationDays: z.number().int().min(1).max(60),
      cpmMinor: z.number().int().min(10).max(1_000_000),
      avgFrequency: z.number().min(1).max(10),
      estimateSpreadBps: z.number().int().min(0).max(5000),
      audienceFloorDailyViewers: z.number().int().min(0).max(10_000_000),
      audienceFloorReach: z.number().int().min(0).max(100_000_000),
      dailyFillBps: bps.min(1),
      maxReachShareBps: bps.min(1),
      locationAudienceShareByRadiusBps: z.record(
        z.string().regex(/^\d+$/),
        bps.min(1),
      ),
      categoryAudienceShareBps: bps.min(1),
      minDeliverableBps: bps,
      pacingMultiplier: z.number().min(1).max(20),
    })
    .strict()
    .partial(),
});
export type PromotionPricingInput = z.infer<typeof promotionPricingSchema>;

export const adminCampaignRefundSchema = z.object({
  campaignId: uuid,
  expectedVersion: z.number().int().min(1),
  reason,
});

// ── Small shared request shapes ──────────────────────────────────────

export const cursorRequestSchema = z.object({ cursor: optionalString });

export const ownContentRequestSchema = z.object({
  kind: contentKindSchema.optional(),
  cursor: optionalString,
});

export const checkoutIdSchema = z.object({ checkoutId: uuid });
