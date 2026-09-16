// Fixed product words for Spotlight + Stories, shared by web, mobile and the
// admin console. Never promise reach, review times or outcomes here.

import type {
  ContentCampaignObjective,
  ContentCampaignStatus,
  ContentFeedSurface,
} from "@abonten/types/contentType";

export const SPOTLIGHT_PRODUCT_NAME = "Spotlight";
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
  event: { available: boolean; status: string; archived: boolean } | null;
  place: { available: boolean; temporaryStatus: string | null } | null;
  publisher: { kind: "organizer" | "place" | "abonten" };
}): { label: string; target: "event" | "place" | "profile" | null } {
  if (post.event) {
    if (post.event.status === "canceled") {
      return { label: "Event cancelled", target: null };
    }
    if (!post.event.available) {
      return { label: "Event has ended", target: null };
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
