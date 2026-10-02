// Fixed product words for Spotlight + Stories, shared by web, mobile and the
// admin console. Never promise reach, review times or outcomes here. The
// words themselves live under `content.*` in packages/i18n (core namespace);
// this module only knows which key says what.

import type {
  ContentCampaignObjective,
  ContentCampaignStatus,
  ContentFeedSurface,
} from "@abonten/types/contentType";
import type { CoreTranslator } from "../i18n/translator";

export const SPOTLIGHT_PRODUCT_NAME = "Spotlight";
export const STORIES_PRODUCT_NAME = "Stories";

export const SPOTLIGHT_TAGLINE_KEY = "content.spotlightTagline";
export const STORIES_TAGLINE_KEY = "content.storiesTagline";

/** The paid-placement disclosure every promoted Spotlight must show. */
export const SPONSORED_LABEL_KEY = "content.sponsored";

export const YOUR_STORY_LABEL_KEY = "content.yourStory";

export const STORY_EXPIRED_MESSAGE_KEY = "content.storyExpired";

export const CONTENT_RIGHTS_ACKNOWLEDGEMENT_KEY =
  "content.rightsAcknowledgement";

export const FEED_SURFACES: readonly ContentFeedSurface[] = [
  "for_you",
  "following",
  "nearby",
  "happening_soon",
  "trending",
] as const;

export function feedSurfaceLabel(
  t: CoreTranslator,
  surface: ContentFeedSurface,
): string {
  return t(`content.feedSurface.${surface}`);
}

export const CAMPAIGN_STATUSES: readonly ContentCampaignStatus[] = [
  "draft",
  "pending_payment",
  "payment_confirmed",
  "pending_review",
  "scheduled",
  "active",
  "paused",
  "completed",
  "rejected",
  "cancelled",
  "refunded",
] as const;

/** Narrows a status read from a history row (stored as text). */
export function isCampaignStatus(
  value: string | null | undefined,
): value is ContentCampaignStatus {
  return (CAMPAIGN_STATUSES as readonly string[]).includes(value ?? "");
}

export function campaignStatusLabel(
  t: CoreTranslator,
  status: ContentCampaignStatus,
): string {
  return t(`content.campaignStatus.${status}`);
}

export const CAMPAIGN_OBJECTIVES: readonly ContentCampaignObjective[] = [
  "views",
  "profile_visits",
  "event_views",
  "place_views",
  "ticket_sales",
  "reservations",
] as const;

export function campaignObjectiveLabel(
  t: CoreTranslator,
  objective: ContentCampaignObjective,
): string {
  return t(`content.campaignObjective.${objective}`);
}

// ── Promotions (reach-based) ─────────────────────────────────────────
// A promotion buys extra distribution, never a number of views. Every
// number shown to an advertiser before or during a run is an estimate.

export const PROMOTION_INTRO_KEY = "content.promotion.intro";
export const PROMOTION_ESTIMATE_NOTE_KEY = "content.promotion.estimateNote";
export const PROMOTION_BILLING_NOTE_KEY = "content.promotion.billingNote";
export const PROMOTION_REVIEW_NOTE_KEY = "content.promotion.reviewNote";
export const PROMOTION_CASH_NOTE_KEY = "content.promotion.cashNote";

export type PromotionEstimateBasis = "observed" | "assumed" | "no_data";

export function promotionEstimateBasisLabel(
  t: CoreTranslator,
  basis: PromotionEstimateBasis,
): string {
  return t(`content.promotion.estimateBasis.${basis}`);
}

export type PromotionEndReason = "budget_delivered" | "run_ended";

export function promotionEndReasonLabel(
  t: CoreTranslator,
  reason: PromotionEndReason,
): string {
  return t(`content.promotion.endReason.${reason}`);
}

export type ContentCtaInput = {
  event: {
    available: boolean;
    status: string;
    archived: boolean;
    ended?: boolean;
    soldOut?: boolean;
  } | null;
  place: { available: boolean; temporaryStatus: string | null } | null;
  publisher: { kind: "organizer" | "place" | "abonten" };
};

export type ContentCta = {
  label: string;
  target: "event" | "place" | "profile" | null;
};

/** The CTA a post's attachment earns, based only on live entity state. */
export function contentCtaLabel(
  t: CoreTranslator,
  post: ContentCtaInput,
): ContentCta {
  if (post.event) {
    if (post.event.status === "canceled") {
      return { label: t("content.cta.eventCancelled"), target: null };
    }
    if (post.event.ended) {
      return { label: t("content.cta.eventEnded"), target: null };
    }
    if (!post.event.available) {
      // Older documents carry no `ended`; unavailable then meant ended.
      return {
        label:
          post.event.ended === undefined
            ? t("content.cta.eventEnded")
            : t("content.cta.eventUnavailable"),
        target: null,
      };
    }
    if (post.event.soldOut) {
      return { label: t("content.cta.soldOut"), target: "event" };
    }
    return { label: t("content.cta.viewEvent"), target: "event" };
  }
  if (post.place) {
    if (!post.place.available) {
      return {
        label:
          post.place.temporaryStatus === "permanently_closed"
            ? t("content.cta.permanentlyClosed")
            : t("content.cta.placeUnavailable"),
        target: null,
      };
    }
    return { label: t("content.cta.viewPlace"), target: "place" };
  }
  if (post.publisher.kind === "place") {
    return { label: t("content.cta.viewPlace"), target: "place" };
  }
  if (post.publisher.kind === "organizer") {
    return { label: t("content.cta.viewProfile"), target: "profile" };
  }
  return { label: "", target: null };
}

/**
 * The CTA for a mobile Spotlight or Story overlay, where the publisher's
 * avatar and name already open their profile or place. Only an attached
 * event or place is a destination worth a button; the publisher fallbacks
 * ("View profile", "View place" for a place's own post) would duplicate the
 * tappable identity, so they return no label.
 */
export function contentDestinationCta(
  t: CoreTranslator,
  post: ContentCtaInput,
): ContentCta {
  if (!post.event && !post.place) return { label: "", target: null };
  return contentCtaLabel(t, post);
}
