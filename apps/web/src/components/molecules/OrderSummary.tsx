import type { PlacePromotionSummaryProps } from "@abonten/types/placeType";
import type { EventPromotionSummaryProps } from "@abonten/types/postsType";

type OrderSummaryProps = {
  orderSummary: PlacePromotionSummaryProps | EventPromotionSummaryProps;
  checkoutId: string;
};

/**
 * Standalone-purchase checkout summary, shared by Featured Places promotions
 * and Event promotions — both are a single purchase with no basket/selection
 * concept, unlike ticket checkouts (which moved to
 * PendingCheckoutsBasket/TicketCheckoutSessionCard).
 */
export default function OrderSummary({ orderSummary }: OrderSummaryProps) {
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
