// One live or queued promotion the signed-in person owns — the rows of the
// Settings "Promotion Details" / Overview card on web and mobile
// (@abonten/services/promotions/activePromotionsCore).

export type ActivePromotionState =
  | "active"
  | "scheduled"
  | "in_review"
  | "paused";

export type ActivePromotionSummary = {
  resourceType: "event" | "place" | "spotlight";
  /** The event, place or Spotlight post promoted. */
  resourceId: string;
  /** A Spotlight campaign's id (opens its detail screen); null otherwise. */
  campaignId: string | null;
  resourceName: string;
  tierLabel: string | null;
  state: ActivePromotionState;
  startsAt: string;
  endsAt: string;
};
