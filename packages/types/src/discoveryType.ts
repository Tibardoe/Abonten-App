// Discovery programme switches, notification preferences, subscriptions,
// opt-in prompts and recommendations. Mirrors
// supabase/migrations/20260913090200_discovery_program_setting.sql,
// 20260913090300_notification_subscriptions.sql and
// 20260913090400_recommendations_engine.sql.

export type DiscoveryAudience = "staff" | "beta" | "all";

/** What one person may use right now. Fails closed to everything off. */
export type DiscoveryProgram = {
  searchV2: boolean;
  organizerSearch: boolean;
  placeSearch: boolean;
  /** Prompts, "Notify me", the preference centre's follow sections, For you. */
  personalization: boolean;
  prompts: boolean;
};

export const DISABLED_DISCOVERY_PROGRAM: DiscoveryProgram = {
  searchV2: false,
  organizerSearch: false,
  placeSearch: false,
  personalization: false,
  prompts: false,
};

/** Optional categories a person controls. Transactional notices have no key. */
export type NotificationPreferences = {
  recommendationsPush: boolean;
  organizerAlertsPush: boolean;
  placeUpdatesPush: boolean;
  socialPush: boolean;
  rewardEmails: boolean;
  /** ISO time until which optional notifications are held, or null. */
  pausedUntil: string | null;
  /** The account's email, null for phone-only accounts. */
  email: string | null;
};

export type NotificationPreferencesPatch = Partial<
  Pick<
    NotificationPreferences,
    | "recommendationsPush"
    | "organizerAlertsPush"
    | "placeUpdatesPush"
    | "socialPush"
    | "rewardEmails"
  >
> & {
  /** "two_weeks" pauses optional notifications; "resume" clears a pause. */
  pause?: "two_weeks" | "resume";
};

export type SubscriptionKind =
  | "organizer"
  | "place"
  | "similar_events"
  | "similar_places";

export type SubscriptionSource =
  | "purchase_prompt"
  | "rsvp_prompt"
  | "place_prompt"
  | "profile"
  | "search"
  | "settings";

export type SubscriptionStatus = "active" | "paused" | "unsubscribed";

export type NotificationSubscription = {
  id: string;
  kind: SubscriptionKind;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  createdAt: string;
  /** Human label: "@username", place name, "Music & Concerts near Accra". */
  label: string;
  /** Organizer username / place slug for linking; null for topics. */
  targetSlug: string | null;
  targetId: string | null;
  topicCategory: string | null;
  topicRadiusKm: number | null;
  imagePublicId: string | null;
  imageVersion: string | null;
};

export type SubscriptionTarget =
  | { kind: "organizer"; organizerId: string }
  | { kind: "place"; placeId: string }
  /** Similar events: category and point come from this event. */
  | { kind: "similar_events"; eventId: string }
  /** Similar places: category and point come from this place. */
  | { kind: "similar_places"; placeId: string };

export type SubscriptionStatusResult = {
  subscribed: boolean;
  subscriptionId: string | null;
};

export type PromptContext =
  | { context: "purchase"; eventId: string }
  | { context: "rsvp"; eventId: string }
  | {
      context: "place";
      placeId: string;
      trigger: "favorite" | "review" | "visit";
    };

/** What a success screen may offer. Every field null = show nothing. */
export type PromptOffer = {
  similarEvents: {
    targetKey: string;
    category: string;
    locality: string | null;
  } | null;
  organizer: {
    targetKey: string;
    organizerId: string;
    username: string;
  } | null;
  place: {
    targetKey: string;
    placeId: string;
    name: string;
    category: string | null;
  } | null;
};

export const EMPTY_PROMPT_OFFER: PromptOffer = {
  similarEvents: null,
  organizer: null,
  place: null,
};

export type PromptResponse = {
  context: PromptContext;
  response: "accepted" | "dismissed";
  /** On accept: which offers the person ticked. Ignored on dismiss. */
  accept?: {
    similarEvents?: boolean;
    organizer?: boolean;
    place?: boolean;
  };
};

export type RecommendationReason =
  | "organizer"
  | "place"
  | "similar_events"
  | "similar_places";

export type RecommendationItem = {
  id: string;
  subjectType: "event" | "place";
  subjectId: string;
  reason: RecommendationReason;
  /** One line explaining why: "From @abonten_hub", "Similar to events you liked". */
  reasonLabel: string;
  createdAt: string;
  event: {
    id: string;
    title: string;
    eventCode: string;
    startsAt: string | null;
    flyerPublicId: string | null;
    flyerVersion: string | null;
    address: string | null;
    category: string | null;
  } | null;
  place: {
    id: string;
    name: string;
    slug: string;
    coverPublicId: string | null;
    coverVersion: string | null;
    address: string | null;
    category: string | null;
  } | null;
};

/** The admin Discovery settings row (camelCase). */
export type DiscoverySettings = {
  searchV2Enabled: boolean;
  searchAudience: DiscoveryAudience;
  organizerSearchEnabled: boolean;
  placeSearchEnabled: boolean;
  searchLoggingEnabled: boolean;
  searchLogRetentionDays: number;
  recommendationsEnabled: boolean;
  recommendationsShadowMode: boolean;
  recommendationsAudience: DiscoveryAudience;
  promptsEnabled: boolean;
  betaUserIds: string[];
  dailyPushCap: number;
  weeklyPushCap: number;
  organizerCooldownHours: number;
  similarDefaultRadiusKm: number;
  candidateTtlDays: number;
  ignorePauseAfter: number;
  ignorePauseDays: number;
  digestHourLocal: number;
  promptCooldownDays: number;
  promptDismissDays: number;
  promptMaxShows: number;
  recommendationRetentionDays: number;
  generateWatermark: string;
  updatedAt: string;
  updatedBy: string | null;
};
