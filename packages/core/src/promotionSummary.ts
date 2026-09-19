import type {
  ActivePromotionState,
  ActivePromotionSummary,
} from "@abonten/types/promotionSummaryType";

// Wording for the Settings promotion summary, shared by web and mobile so
// both say the same thing about the same promotion.

export const PROMOTION_KIND_LABEL: Record<
  ActivePromotionSummary["resourceType"],
  string
> = {
  event: "Featured event",
  place: "Featured place",
  spotlight: "Promoted Spotlight",
};

export const PROMOTION_STATE_LABEL: Record<ActivePromotionState, string> = {
  active: "Active",
  scheduled: "Starts soon",
  in_review: "In review",
  paused: "Paused",
};

/** "3-day package · Active" / "Promoted Spotlight · In review". */
export function promotionStatusLine(p: ActivePromotionSummary): string {
  const state = PROMOTION_STATE_LABEL[p.state];
  return p.tierLabel ? `${p.tierLabel} package · ${state}` : state;
}
