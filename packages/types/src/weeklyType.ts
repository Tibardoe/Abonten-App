// Abonten Weekly: editions, sections, items, scopes and programme switches.
// Mirrors supabase/migrations/20260913120000_weekly_core.sql. Field names on
// `WeeklyEventRow` / `WeeklyPlaceRow` match the discovery RPC row shapes so
// the existing event and place cards render them unchanged.

import type { PlaceType } from "./placeType";
import type { UserPostType } from "./postsType";

export type WeeklyAudience = "staff" | "beta" | "all";

export type WeeklyEditionStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "archived";

export type WeeklySectionKind =
  | "editorial"
  | "curated"
  | "this_week"
  | "weekend"
  | "new"
  | "free"
  | "trending"
  | "hidden_gems"
  | "nearby"
  | "category"
  | "top_places"
  | "new_places"
  | "for_you";

export type WeeklySubjectScope = "events" | "places" | "mixed";

export type WeeklyLayout = "hero" | "carousel" | "grid" | "list" | "editorial";

export type WeeklySubjectType = "event" | "place";

export type WeeklyItemSource = "manual" | "suggested" | "auto";

/** Why a listing cannot appear right now. Null = fine. */
export type WeeklyValidityReason =
  | "missing"
  | "canceled"
  | "removed"
  | "hidden"
  | "restricted"
  | "archived"
  | "ended"
  | "not_published"
  | "permanently_closed"
  | "unsupported";

export type WeeklyTransitionAction =
  | "schedule"
  | "unschedule"
  | "publish"
  | "unpublish"
  | "archive"
  | "restore";

/** What one visitor may see. Fails closed. */
export type WeeklyProgram = {
  enabled: boolean;
  teaser: boolean;
};

export const DISABLED_WEEKLY_PROGRAM: WeeklyProgram = {
  enabled: false,
  teaser: false,
};

export type WeeklyEventRow = UserPostType & {
  organizer_username?: string | null;
  organizer_verified?: boolean;
};

export type WeeklyPlaceRow = PlaceType;

export type WeeklyItem = {
  id: string;
  position: number;
  subjectType: WeeklySubjectType;
  subjectId: string;
  headline: string | null;
  blurb: string | null;
  event: WeeklyEventRow | null;
  place: WeeklyPlaceRow | null;
};

export type WeeklySection = {
  id: string;
  position: number;
  kind: WeeklySectionKind;
  subjectScope: WeeklySubjectScope;
  layout: WeeklyLayout;
  title: string;
  subtitle: string | null;
  iconKey: string | null;
  body: string | null;
  items: WeeklyItem[];
};

export type WeeklyEditionHeader = {
  id: string;
  scopeSlug: string;
  scopeName: string;
  scopeIsNational: boolean;
  /** Monday, yyyy-mm-dd (Accra). */
  weekStart: string;
  /** Sunday, yyyy-mm-dd (Accra). */
  weekEnd: string;
  title: string;
  subtitle: string | null;
  intro: string | null;
  publishedAt: string | null;
  weekIsOver: boolean;
};

/** A published edition as the public sees it. */
export type WeeklyEditionDocument = {
  edition: WeeklyEditionHeader;
  sections: WeeklySection[];
  /** The scope the visitor asked for. */
  requestedScope: string;
  /** True when a regional request is showing national picks. */
  isFallbackScope: boolean;
  /** True when this week's edition is not out yet and last week's is shown. */
  isPreviousWeek: boolean;
  isCurrent: boolean;
};

export type WeeklyEditionResult = {
  /** False when Abonten Weekly is not open to this visitor. */
  available: boolean;
  edition: WeeklyEditionDocument | null;
  /**
   * Shown when there is no edition to show: upcoming events this week in
   * the scope (or Ghana-wide). Empty when the programme is closed.
   */
  fallbackEvents: UserPostType[];
};

/**
 * One rotating background of an Abonten Weekly banner: a listing from the
 * edition that has an image, with just enough text for a caption.
 */
export type WeeklyBannerSlide = {
  /** The weekly_item id (stable React key). */
  key: string;
  subjectType: WeeklySubjectType;
  /** event.id or place.id, for app navigation. */
  subjectId: string;
  title: string;
  /** The editor's headline for this listing, if any. */
  headline: string | null;
  /** "Sat, 20 Sep · 7:00 PM" for events, "Restaurant · 4.6 ★" for places. */
  meta: string | null;
  publicId: string;
  version: string | null;
  /** Web path of the listing (/events/<code> or /places/<slug>). */
  webPath: string;
};

export type WeeklyTeaser = {
  scopeSlug: string;
  scopeName: string;
  weekStart: string;
  title: string;
  subtitle: string | null;
  isFallbackScope: boolean;
  itemCount: number;
  /**
   * Up to three images. Kept for app builds released before `slides`
   * existed; new clients use `slides`.
   */
  images: { publicId: string; version: string | null; alt: string }[];
  /** Up to six listings with images, in edition order, for the banner. */
  slides: WeeklyBannerSlide[];
  href: string;
};

export type WeeklyScopeResolution = {
  slug: string;
  name: string;
  isNational: boolean;
};

// ── Admin ────────────────────────────────────────────────────────────

export type WeeklyAdminItem = WeeklyItem & {
  source: WeeklyItemSource;
  pinned: boolean;
  validity: WeeklyValidityReason | null;
  score: number | null;
  createdAt: string;
};

export type WeeklyAdminSection = Omit<WeeklySection, "items"> & {
  isVisible: boolean;
  config: Record<string, unknown>;
  updatedAt: string;
  items: WeeklyAdminItem[];
};

export type WeeklyAdminEditionHeader = WeeklyEditionHeader & {
  scopeId: string;
  scopeLat: number | null;
  scopeLng: number | null;
  scopeRadiusKm: number | null;
  status: WeeklyEditionStatus;
  scheduledFor: string | null;
  unpublishedAt: string | null;
  archivedAt: string | null;
  version: number;
  duplicatedFromEditionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WeeklyValidationIssue = {
  code:
    | "scope_retired"
    | "week_over"
    | "no_valid_items"
    | "invalid_items"
    | "duplicate_subjects"
    | "organizer_concentration"
    | "recently_featured"
    | "empty_sections";
  items?: {
    itemId: string;
    sectionId: string;
    subjectType: string;
    subjectId: string;
    reason: WeeklyValidityReason;
  }[];
  subjects?: {
    subjectType: string;
    subjectId: string;
    sections?: number;
    editions?: number;
  }[];
  groups?: { sectionId: string; organizerId: string; events: number }[];
  sectionIds?: string[];
};

export type WeeklyValidation = {
  canPublish: boolean;
  validItems: number;
  errors: WeeklyValidationIssue[];
  warnings: WeeklyValidationIssue[];
};

export type WeeklyAdminEdition = {
  edition: WeeklyAdminEditionHeader;
  sections: WeeklyAdminSection[];
  validation: WeeklyValidation;
};

export type WeeklyEditionListRow = {
  id: string;
  scopeId: string;
  scopeSlug: string;
  scopeName: string;
  weekStart: string;
  status: WeeklyEditionStatus;
  title: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  itemCount: number;
  sectionCount: number;
  version: number;
  updatedAt: string;
};

export type WeeklyScope = {
  id: string;
  slug: string;
  name: string;
  countryCode: string;
  isNational: boolean;
  centreLat: number | null;
  centreLng: number | null;
  radiusKm: number | null;
  status: "active" | "retired";
  position: number;
  editionCount: number;
  updatedAt: string;
};

export type WeeklySettings = {
  enabled: boolean;
  audience: WeeklyAudience;
  betaUserIds: string[];
  teaserEnabled: boolean;
  defaultPublishHourLocal: number;
  maxItemsPerSection: number;
  maxPerOrganizerPerSection: number;
  exposureLookbackEditions: number;
  editionRetentionWeeks: number;
  updatedAt: string;
  updatedBy: string | null;
};

/** A listing an editor can add, from the admin picker. */
export type WeeklySubjectOption = {
  subjectType: WeeklySubjectType;
  subjectId: string;
  label: string;
  sublabel: string | null;
  imagePublicId: string | null;
  imageVersion: string | null;
  startsAt: string | null;
  validity: WeeklyValidityReason | null;
};
