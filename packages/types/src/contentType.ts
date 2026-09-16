// Spotlight + Stories content platform. Mirrors
// supabase/migrations/20260916120000_content_platform_core.sql,
// 20260916120100_content_platform_feed_and_engagement.sql and
// 20260916120200_content_platform_campaigns.sql. Document shapes are the
// jsonb built by content_post_documents(); everything else maps a table.

export type ContentKind = "spotlight" | "story";

export type ContentAudience = "staff" | "beta" | "all";

export type ContentFeedSurface =
  | "for_you"
  | "following"
  | "nearby"
  | "happening_soon"
  | "trending";

export type ContentPublisherKind = "organizer" | "place" | "abonten";

export type ContentPostStatus = "draft" | "published" | "archived" | "deleted";

export type ContentModerationState =
  | "visible"
  | "hidden"
  | "removed"
  | "restricted";

export type ContentMediaStatus =
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready"
  | "failed"
  | "deleted";

export type ContentPlaybackStatus = "none" | "pending" | "ready" | "failed";

export type ContentReactionEmoji =
  | "❤️"
  | "🔥"
  | "😂"
  | "😍"
  | "👏"
  | "😮"
  | "👍";

export type ContentShareChannel =
  | "native"
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "x"
  | "copy_link"
  | "internal"
  | "other";

export type ContentViewKind =
  | "impression"
  | "view_start"
  | "meaningful_view"
  | "completion"
  | "replay";

export type ContentViewSurface =
  | ContentFeedSurface
  | "stories"
  | "profile"
  | "deep_link"
  | "search"
  | "embed";

export type ContentClickKind =
  | "profile"
  | "event"
  | "place"
  | "ticket"
  | "cta"
  | "hashtag";

/** What one visitor may use right now. Fails closed everywhere. */
export type ContentProgram = {
  spotlight: boolean;
  spotlightPosting: boolean;
  spotlightComments: boolean;
  spotlightDownloads: boolean;
  spotlightPromotions: boolean;
  nearby: boolean;
  trending: boolean;
  happeningSoon: boolean;
  stories: boolean;
  storiesPosting: boolean;
  storiesComments: boolean;
  storiesReactions: boolean;
  storiesSharing: boolean;
  /** This person may publish (organizer, place owner or staff). */
  canPublish: boolean;
  /** Places this person may publish as (owner of a live place). */
  publisherPlaces: { id: string; name: string }[];
  storyTtlHours: number;
  maxStoryItems: number;
  spotlightVideoMaxSeconds: number;
  storyVideoMaxSeconds: number;
};

export const DISABLED_CONTENT_PROGRAM: ContentProgram = {
  spotlight: false,
  spotlightPosting: false,
  spotlightComments: false,
  spotlightDownloads: false,
  spotlightPromotions: false,
  nearby: false,
  trending: false,
  happeningSoon: false,
  stories: false,
  storiesPosting: false,
  storiesComments: false,
  storiesReactions: false,
  storiesSharing: false,
  canPublish: false,
  publisherPlaces: [],
  storyTtlHours: 24,
  maxStoryItems: 10,
  spotlightVideoMaxSeconds: 90,
  storyVideoMaxSeconds: 60,
};

export type ContentPublisher = {
  kind: ContentPublisherKind;
  id: string;
  name: string;
  username?: string | null;
  slug?: string | null;
  avatarPublicId: string | null;
  avatarVersion: string | number | null;
  verified: boolean;
  ownerId?: string;
};

export type ContentMediaItem = {
  id: string;
  type: "image" | "video";
  publicId: string;
  version: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  mediaUrl: string;
  playbackUrl: string | null;
  posterUrl: string | null;
  thumbnailUrl: string | null;
  status: ContentMediaStatus;
  playbackStatus: ContentPlaybackStatus;
  position: number;
};

export type ContentEventSummary = {
  id: string;
  title: string;
  eventCode: string;
  status: string;
  flyerPublicId: string;
  flyerVersion: string;
  startsAt: string | null;
  endsAt: string | null;
  requireRegistration: boolean;
  archived: boolean;
  /** Live and not yet ended: the CTA can say "View event". */
  available: boolean;
  /** Every date is over. */
  ended: boolean;
  /** Capacity or ticket stock used up (same rule as the event page). */
  soldOut: boolean;
};

export type ContentPlaceSummary = {
  id: string;
  name: string;
  slug: string;
  coverPublicId: string;
  coverVersion: string;
  status: string;
  temporaryStatus: string | null;
  available: boolean;
};

export type ContentViewerState = {
  liked: boolean;
  saved: boolean;
  reaction: ContentReactionEmoji | null;
  following: boolean;
  seen: boolean;
  isAuthor: boolean;
  notInterested: boolean;
};

export type ContentCounts = {
  likes: number;
  reactions: number;
  comments: number;
  shares: number;
  saves: number;
  views: number;
};

export type ContentPostDocument = {
  id: string;
  kind: ContentKind;
  authorId: string;
  caption: string | null;
  hashtags: string[];
  category: string | null;
  status: ContentPostStatus;
  moderationState: ContentModerationState;
  publishedAt: string | null;
  expiresAt: string | null;
  allowComments: boolean;
  allowDownload: boolean;
  counts: ContentCounts;
  location: { lat: number; lng: number; source: string | null } | null;
  media: ContentMediaItem[];
  publisher: ContentPublisher;
  event: ContentEventSummary | null;
  place: ContentPlaceSummary | null;
  viewer: ContentViewerState;
};

export type ContentFeedItem = {
  post: ContentPostDocument;
  /** Set when this slot is a paid placement; the UI must show a disclosure. */
  sponsored: { campaignId: string } | null;
};

export type ContentFeedPage = {
  items: ContentFeedItem[];
  nextCursor: string | null;
  hasNextPage: boolean;
  surface: ContentFeedSurface;
};

export type StoryTrayEntry = {
  publisher: ContentPublisher;
  storyIds: string[];
  storyCount: number;
  latestAt: string;
  hasUnseen: boolean;
  isSelf: boolean;
  muted: boolean;
};

export type StoryTray = {
  entries: StoryTrayEntry[];
  /** True when the viewer may publish a Story (shows "Your Story"). */
  canPublish: boolean;
};

export type StorySequence = {
  publisher: ContentPublisher;
  stories: ContentPostDocument[];
};

export type ContentCommentAuthor = {
  id: string;
  username: string | null;
  fullName: string | null;
  avatarPublicId: string | null;
  avatarVersion: string | null;
};

export type ContentComment = {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  likeCount: number;
  replyCount: number;
  author: ContentCommentAuthor;
  likedByMe: boolean;
  isMine: boolean;
  /** The post's author may remove any comment on their post. */
  canModerate: boolean;
};

export type ContentCommentsPage = {
  comments: ContentComment[];
  nextCursor: string | null;
  hasNextPage: boolean;
};

export type ContentViewEventInput = {
  postId: string;
  kind: ContentViewKind;
  watchedMs?: number;
  surface?: ContentViewSurface;
  campaignId?: string | null;
};

export type ContentInsights = {
  totals: {
    impressions: number;
    viewStarts: number;
    meaningfulViews: number;
    completions: number;
    replays: number;
    uniqueViewers: number;
    watchedMsTotal: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    profileClicks: number;
    eventClicks: number;
    placeClicks: number;
    ticketClicks: number;
    ctaClicks: number;
  };
  series: {
    day: string;
    impressions: number;
    meaningfulViews: number;
    completions: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
  }[];
  conversions: { ticketPurchases: number; reservations: number };
};

/** A row of the creator's own list (drafts included). */
export type ContentOwnPost = {
  id: string;
  kind: ContentKind;
  status: ContentPostStatus;
  moderationState: ContentModerationState;
  caption: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  cover: {
    thumbnailUrl: string | null;
    mediaUrl: string;
    type: "image" | "video";
  } | null;
  counts: ContentCounts;
  publisher: { kind: ContentPublisherKind; placeId: string | null };
  eventId: string | null;
  placeId: string | null;
  campaign: { id: string; status: ContentCampaignStatus } | null;
};

// ── Campaigns ───────────────────────────────────────────────────────

export type ContentCampaignStatus =
  | "draft"
  | "pending_payment"
  | "payment_confirmed"
  | "pending_review"
  | "scheduled"
  | "active"
  | "paused"
  | "completed"
  | "rejected"
  | "cancelled"
  | "refunded";

export type ContentCampaignObjective =
  | "views"
  | "profile_visits"
  | "event_views"
  | "place_views"
  | "ticket_sales"
  | "reservations";

/** Server-side pricing and estimate assumptions (content_promotion_pricing). */
export type ContentPromotionPricing = {
  version: number;
  currency: string;
  minBudgetMinor: number;
  maxBudgetMinor: number;
  budgetStepMinor: number;
  suggestedBudgetsMinor: number[];
  durationOptionsDays: number[];
  defaultDurationDays: number;
  /** Cost of 1,000 delivered sponsored impressions, pesewas. */
  cpmMinor: number;
  avgFrequency: number;
  estimateSpreadBps: number;
  audienceFloorDailyViewers: number;
  audienceFloorReach: number;
  dailyFillBps: number;
  maxReachShareBps: number;
  /** Audience share within each selectable radius, keyed by km ("5", "10"…). */
  locationAudienceShareByRadiusBps: Record<string, number>;
  categoryAudienceShareBps: number;
  minDeliverableBps: number;
  pacingMultiplier: number;
  updatedAt: string;
  updatedBy: string | null;
};

/** What the promote screen needs before it asks for an estimate. */
export type ContentPromotionOptions = {
  currency: string;
  minBudgetMinor: number;
  maxBudgetMinor: number;
  budgetStepMinor: number;
  suggestedBudgetsMinor: number[];
  durationOptionsDays: number[];
  defaultDurationDays: number;
  radiusOptionsKm: number[];
};

export type ContentPromotionAudience = {
  dailyViewers: number;
  reach28d: number;
  daysObserved: number;
  computedAt: string | null;
};

export type ContentPromotionTargetingInput =
  | { area: "everywhere" }
  | { area: "near_post"; radiusKm: number };

export type ContentPromotionEstimate = {
  pricingVersion: number;
  currency: string;
  budgetMinor: number;
  durationDays: number;
  cpmMinor: number;
  /** Sponsored impressions the budget pays for; delivery stops here. */
  impressionGoal: number;
  /** Impressions the audience can realistically take in the run. */
  estimatedImpressions: number;
  reachLow: number;
  reachHigh: number;
  /** observed = from real audience data; assumed = admin floor; no_data = can't estimate. */
  basis: "observed" | "assumed" | "no_data";
  deliverableBps: number;
  /** False when the server will refuse to sell this budget/audience. */
  deliverable: boolean;
  limitedBy: "budget" | "audience";
};

export type ContentCampaignMetrics = {
  impressionGoal: number;
  impressions: number;
  reach: number;
  meaningfulViews: number;
  completions: number;
  deliveryBps: number;
  estimatedReachLow: number;
  estimatedReachHigh: number;
  clicks: { profile: number; event: number; place: number; cta: number };
  follows: number;
  conversions: { ticketPurchases: number; reservations: number };
};

export type ContentCampaignTargeting = {
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  categories: string[];
};

export type ContentCampaign = {
  id: string;
  postId: string;
  advertiserId: string;
  objective: ContentCampaignObjective;
  budgetMinor: number;
  currency: string;
  /** Longest the campaign may run once approved (a delivery limit). */
  durationDays: number;
  startsAt: string;
  endsAt: string;
  status: ContentCampaignStatus;
  pricingVersion: number;
  cpmMinor: number;
  impressionGoal: number;
  estimatedImpressions: number;
  estimatedReachLow: number;
  estimatedReachHigh: number;
  estimateBasis: ContentPromotionEstimate["basis"];
  endReason: "budget_delivered" | "run_ended" | null;
  targeting: ContentCampaignTargeting;
  paidMinor: number;
  spentMinor: number;
  refundedMinor: number;
  remainingMinor: number;
  refundableMinor: number;
  checkoutId: string | null;
  transactionId: string | null;
  reviewReason: string | null;
  pauseReason: string | null;
  pauseSource: "advertiser" | "admin" | "system" | null;
  impressions: number;
  reach: number;
  views: number;
  completions: number;
  clicks: number;
  conversions: number;
  activatedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  /** Delivery breakdown; present on single-campaign reads. */
  metrics?: ContentCampaignMetrics | null;
  /** Denormalised for lists. */
  post?: {
    id: string;
    caption: string | null;
    thumbnailUrl: string | null;
    kind: ContentKind;
    eventId: string | null;
    placeId: string | null;
  } | null;
  advertiser?: {
    id: string;
    username: string | null;
    fullName: string | null;
  } | null;
};

export type ContentCampaignCheckout = {
  id: string;
  campaignId: string;
  status: "pending" | "paid" | "expired" | "cancelled";
  totalPrice: number;
  currency: string;
  expiresAt: string | null;
  /** e.g. "GH₵ 50 budget · up to 7 days" */
  summaryLabel: string;
  estimatedReachLow: number;
  estimatedReachHigh: number;
  postCaption: string | null;
};

export type ContentCampaignEvent = {
  id: number;
  actorKind: "advertiser" | "admin" | "system";
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  createdAt: string;
};

export type ContentCampaignLedgerEntry = {
  id: number;
  entryType: "payment" | "accrual" | "refund" | "adjustment";
  amountMinor: number;
  currency: string;
  note: string | null;
  createdAt: string;
};

// ── Admin settings ──────────────────────────────────────────────────

export type ContentSettings = {
  spotlightEnabled: boolean;
  spotlightAudience: ContentAudience;
  spotlightPostingEnabled: boolean;
  spotlightCommentsEnabled: boolean;
  spotlightDownloadsEnabled: boolean;
  spotlightPromotionsEnabled: boolean;
  sponsoredDeliveryEnabled: boolean;
  nearbyEnabled: boolean;
  trendingEnabled: boolean;
  happeningSoonEnabled: boolean;
  creatorPostingEnabled: boolean;
  storiesEnabled: boolean;
  storiesAudience: ContentAudience;
  storiesPostingEnabled: boolean;
  storiesCommentsEnabled: boolean;
  storiesReactionsEnabled: boolean;
  storiesSharingEnabled: boolean;
  storyTtlHours: number;
  maxStoryItems: number;
  betaUserIds: string[];
  spotlightPostsPerDay: number;
  storiesPerDay: number;
  commentsPerHour: number;
  followsPerHour: number;
  spotlightVideoMaxSeconds: number;
  storyVideoMaxSeconds: number;
  feedPageSize: number;
  sponsoredMaxShareBps: number;
  sponsoredMinGap: number;
  sponsoredDailyCapPerViewer: number;
  trendingWindowHours: number;
  nearbyDefaultRadiusKm: number;
  happeningSoonDays: number;
  rankWeightRecency: number;
  rankWeightEngagement: number;
  rankWeightFollowing: number;
  rankWeightProximity: number;
  rankWeightUrgency: number;
  rankSeenPenalty: number;
  meaningfulViewMs: number;
  viewsPerViewerPerMinute: number;
  expiredStoryRetentionDays: number;
  deletedPostRetentionDays: number;
  rawViewRetentionDays: number;
  orphanMediaHours: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type ContentAdminOverview = {
  spotlight: {
    posts: number;
    activeCreators: number;
    livePosts: number;
    impressions: number;
    meaningfulViews: number;
    completions: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    eventClicks: number;
    placeClicks: number;
    profileClicks: number;
    conversions: number;
  };
  stories: {
    posts: number;
    activePublishers: number;
    live: number;
    viewStarts: number;
    completions: number;
    reactions: number;
    comments: number;
  };
  social: {
    follows: number;
    totalFollows: number;
    reportsOpen: number;
    moderated: number;
  };
  campaigns: {
    created: number;
    advertisers: number;
    pendingReview: number;
    active: number;
    paidMinor: number;
    spentMinor: number;
    refundedMinor: number;
    impressions: number;
    reach: number;
    clicks: number;
    conversions: number;
    unusedToReviewMinor: number;
  };
};

export type ContentAdminPostRow = {
  id: string;
  kind: ContentKind;
  status: ContentPostStatus;
  moderationState: ContentModerationState;
  caption: string | null;
  authorId: string;
  authorName: string | null;
  publisherKind: ContentPublisherKind;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  thumbnailUrl: string | null;
  reportCount: number;
  counts: ContentCounts;
};

export type ContentAdminCommentRow = {
  id: string;
  postId: string;
  body: string;
  status: "visible" | "deleted";
  moderationState: ContentModerationState;
  authorId: string;
  authorName: string | null;
  createdAt: string;
  reportCount: number;
};

export type FollowTargetKind = "organizer" | "place";

export type FollowStatus = {
  following: boolean;
  followerCount: number;
};
