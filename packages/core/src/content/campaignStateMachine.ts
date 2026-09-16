import type { ContentCampaignStatus } from "@abonten/types/contentType";

// Mirror of content_campaign_transition() (migration 20260916120200) for the
// UI and unit tests. The database is the authority; this only decides which
// buttons to show.

export type CampaignActorKind = "advertiser" | "admin" | "system";

const TRANSITIONS: Record<
  ContentCampaignStatus,
  Partial<Record<ContentCampaignStatus, CampaignActorKind[]>>
> = {
  draft: {
    pending_payment: ["advertiser", "system"],
    payment_confirmed: ["system"],
    cancelled: ["advertiser", "admin", "system"],
  },
  pending_payment: {
    draft: ["system"],
    payment_confirmed: ["system"],
    cancelled: ["advertiser", "admin", "system"],
  },
  payment_confirmed: { pending_review: ["system"] },
  pending_review: {
    scheduled: ["admin"],
    active: ["admin"],
    rejected: ["admin"],
    cancelled: ["advertiser", "admin"],
  },
  scheduled: { active: ["system"], cancelled: ["advertiser", "admin"] },
  active: {
    paused: ["advertiser", "admin", "system"],
    completed: ["system"],
    cancelled: ["advertiser", "admin"],
  },
  paused: {
    active: ["advertiser", "admin", "system"],
    completed: ["system"],
    cancelled: ["advertiser", "admin"],
  },
  completed: { refunded: ["admin", "system"] },
  rejected: { refunded: ["admin", "system"] },
  cancelled: { refunded: ["admin", "system"] },
  refunded: {},
};

export function canTransitionCampaign(
  from: ContentCampaignStatus,
  to: ContentCampaignStatus,
  actor: CampaignActorKind,
): boolean {
  return (TRANSITIONS[from]?.[to] ?? []).includes(actor);
}

export const TERMINAL_CAMPAIGN_STATUSES: readonly ContentCampaignStatus[] = [
  "completed",
  "refunded",
];

export function campaignIsLive(status: ContentCampaignStatus): boolean {
  return status === "scheduled" || status === "active" || status === "paused";
}

/** Reasons required by the database for these admin moves. */
export function campaignActionNeedsReason(to: ContentCampaignStatus): boolean {
  return to === "rejected" || to === "cancelled" || to === "paused";
}
