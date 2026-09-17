// Fixed product words for Spotlight + Stories, shared by web, mobile and the
// admin console. Never promise reach, review times or outcomes here.

import type {
  ContentCampaignObjective,
  ContentCampaignStatus,
  ContentFeedSurface,
} from "@abonten/types/contentType";

export const SPOTLIGHT_PRODUCT_NAME = "Spotlight";

/** "1 like", "2 likes", "1,204 views". */
export function countLabel(
  n: number,
  singular: string,
  plural = `${singular}s`,
) {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? singular : plural}`;
}
export const STORIES_PRODUCT_NAME = "Stories";

export const SPOTLIGHT_TAGLINE =
  "Short videos from the events and places around you.";
export const STORIES_TAGLINE =
  "What the organizers and places you follow are up to right now.";

/** The paid-placement disclosure every promoted Spotlight must show. */
export const SPONSORED_LABEL = "Sponsored";

export const YOUR_STORY_LABEL = "Your Story";

export const STORY_EXPIRED_MESSAGE = "This Story has ended.";

export const CONTENT_RIGHTS_ACKNOWLEDGEMENT =
  "I own this content or have permission to share it, and it follows Abonten's content rules.";

export const FEED_SURFACE_LABEL: Record<ContentFeedSurface, string> = {
  for_you: "For you",
  following: "Following",
  nearby: "Nearby",
  happening_soon: "Happening soon",
  trending: "Trending",
};

export const FEED_SURFACES: readonly ContentFeedSurface[] = [
  "for_you",
  "following",
  "nearby",
  "happening_soon",
  "trending",
] as const;

export const CAMPAIGN_STATUS_LABEL: Record<ContentCampaignStatus, string> = {
  draft: "Draft",
  pending_payment: "Awaiting payment",
  payment_confirmed: "Paid",
  pending_review: "In review",
  scheduled: "Scheduled",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const CAMPAIGN_OBJECTIVE_LABEL: Record<
  ContentCampaignObjective,
  string
> = {
  views: "More views",
  profile_visits: "More profile visits",
  event_views: "More event views",
  place_views: "More place views",
  ticket_sales: "More ticket sales",
  reservations: "More reservations",
};

// ── Promotions (reach-based) ─────────────────────────────────────────
// A promotion buys extra distribution, never a number of views. Every
// number shown to an advertiser before or during a run is an estimate.

export const PROMOTION_INTRO =
  "Promoting shows your Spotlight to more people in their feeds, marked “Sponsored”. You choose a budget and who should see it; we estimate how many people it could reach.";

export const PROMOTION_ESTIMATE_NOTE =
  "This is an estimate, not a guarantee. Actual reach depends on how many people in your audience open Spotlight, how often, and what else is being promoted at the same time.";

export const PROMOTION_BILLING_NOTE =
  "You pay the budget up front. It is used only as your Spotlight is shown as sponsored, and the promotion stops when the budget is used or the run ends, whichever comes first. If it ends before the budget is used, the unused amount is shown on the promotion page.";

export const PROMOTION_REVIEW_NOTE =
  "Every promotion is reviewed before it runs. If it isn't approved, you're refunded in full.";

export const PROMOTION_CASH_NOTE =
  "Paid by card or mobile money. Abonten Credit can't be used for promotions.";

export const PROMOTION_ESTIMATE_BASIS_LABEL: Record<
  "observed" | "assumed" | "no_data",
  string
> = {
  observed: "Based on recent Spotlight activity.",
  assumed: "Based on our planning figures while Spotlight is new.",
  no_data: "We can't estimate reach yet.",
};

export const PROMOTION_END_REASON_LABEL: Record<
  "budget_delivered" | "run_ended",
  string
> = {
  budget_delivered: "Budget fully used",
  run_ended: "Run ended before the budget was used",
};

export const CAMPAIGN_OBJECTIVES: readonly ContentCampaignObjective[] = [
  "views",
  "profile_visits",
  "event_views",
  "place_views",
  "ticket_sales",
  "reservations",
] as const;

/** The CTA a post's attachment earns, based only on live entity state. */
export function contentCtaLabel(post: {
  event: {
    available: boolean;
    status: string;
    archived: boolean;
    ended?: boolean;
    soldOut?: boolean;
  } | null;
  place: { available: boolean; temporaryStatus: string | null } | null;
  publisher: { kind: "organizer" | "place" | "abonten" };
}): { label: string; target: "event" | "place" | "profile" | null } {
  if (post.event) {
    if (post.event.status === "canceled") {
      return { label: "Event cancelled", target: null };
    }
    if (post.event.ended) {
      return { label: "Event has ended", target: null };
    }
    if (!post.event.available) {
      // Older documents carry no `ended`; unavailable then meant ended.
      return {
        label:
          post.event.ended === undefined
            ? "Event has ended"
            : "Event unavailable",
        target: null,
      };
    }
    if (post.event.soldOut) {
      return { label: "Sold out", target: "event" };
    }
    return { label: "View event", target: "event" };
  }
  if (post.place) {
    if (!post.place.available) {
      return {
        label:
          post.place.temporaryStatus === "permanently_closed"
            ? "Permanently closed"
            : "Place unavailable",
        target: null,
      };
    }
    return { label: "View place", target: "place" };
  }
  if (post.publisher.kind === "place") {
    return { label: "View place", target: "place" };
  }
  if (post.publisher.kind === "organizer") {
    return { label: "View profile", target: "profile" };
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
  post: Parameters<typeof contentCtaLabel>[0],
): ReturnType<typeof contentCtaLabel> {
  if (!post.event && !post.place) return { label: "", target: null };
  return contentCtaLabel(post);
}
