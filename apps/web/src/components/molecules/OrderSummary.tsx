import {
  PROMOTION_ESTIMATE_NOTE,
  PROMOTION_REVIEW_NOTE,
} from "@abonten/core/content/copy";
import { formatReachRange } from "@abonten/core/content/promotionEstimate";
import type { PlacePromotionSummaryProps } from "@abonten/types/placeType";
import type { EventPromotionSummaryProps } from "@abonten/types/postsType";

export type SpotlightPromotionSummaryProps = {
  type: "spotlight-promotion";
  postCaption: string | null;
  summaryLabel: string;
  estimatedReachLow: number;
  estimatedReachHigh: number;
  totalAmount: number;
};

type OrderSummaryProps = {
  orderSummary:
    | PlacePromotionSummaryProps
    | EventPromotionSummaryProps
    | SpotlightPromotionSummaryProps;
  checkoutId: string;
};

/**
 * Standalone-purchase checkout summary, shared by Featured Places promotions
 * and Event promotions — both are a single purchase with no basket/selection
 * concept, unlike ticket checkouts (which moved to
 * PendingCheckoutsBasket/TicketCheckoutSessionCard).
 */
export default function OrderSummary({ orderSummary }: OrderSummaryProps) {
  if (orderSummary.type === "spotlight-promotion") {
    const { postCaption, summaryLabel, totalAmount } = orderSummary;

    return (
      <div className="border border-border rounded-2xl shadow-lg p-6 space-y-4 bg-card text-card-foreground">
        <h2 className="font-semibold text-lg text-card-foreground">
          Spotlight Promotion
        </h2>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium">Post:</p>
          <p className="text-card-foreground font-semibold line-clamp-2">
            {postCaption?.trim() || "Untitled Spotlight"}
          </p>
        </div>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium">Budget:</p>
          <p className="text-card-foreground font-semibold">{summaryLabel}</p>
        </div>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium">Estimated reach:</p>
          <p className="text-card-foreground font-semibold">
            {formatReachRange({
              reachLow: orderSummary.estimatedReachLow,
              reachHigh: orderSummary.estimatedReachHigh,
            })}
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          {PROMOTION_ESTIMATE_NOTE} {PROMOTION_REVIEW_NOTE} It is shown with a
          Sponsored label.
        </p>

        <div className="flex justify-between pt-2 border-t border-border font-bold text-card-foreground">
          <p>Total Amount</p>
          <p>₵{totalAmount}</p>
        </div>
      </div>
    );
  }

  if (orderSummary.type === "promotion") {
    const { placeName, tierLabel, totalAmount } = orderSummary;

    return (
      <div className="border border-border rounded-2xl shadow-lg p-6 space-y-4 bg-card text-card-foreground">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-lg text-card-foreground">
            Promotion Summary
          </h2>
        </div>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium">Place:</p>
          <p className="text-card-foreground font-semibold">{placeName}</p>
        </div>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium">Duration:</p>
          <p className="text-card-foreground font-semibold">{tierLabel}</p>
        </div>

        <div className="flex justify-between pt-2 border-t border-border font-bold text-card-foreground">
          <p>Total Amount</p>
          <p>₵{totalAmount}</p>
        </div>
      </div>
    );
  }

  const { eventTitle, tierLabel, totalAmount } = orderSummary;

  return (
    <div className="border border-border rounded-2xl shadow-lg p-6 space-y-4 bg-card text-card-foreground">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-lg text-card-foreground">
          Promotion Summary
        </h2>
      </div>

      <div className="text-sm text-muted-foreground">
        <p className="font-medium">Event:</p>
        <p className="text-card-foreground font-semibold">{eventTitle}</p>
      </div>

      <div className="text-sm text-muted-foreground">
        <p className="font-medium">Duration:</p>
        <p className="text-card-foreground font-semibold">{tierLabel}</p>
      </div>

      <div className="flex justify-between pt-2 border-t border-border font-bold text-card-foreground">
        <p>Total Amount</p>
        <p>₵{totalAmount}</p>
      </div>
    </div>
  );
}
