import type { SubscriptionSummaryProps } from "@/types/ticketType";

type OrderSummaryProps = {
  orderSummary: SubscriptionSummaryProps;
  checkoutId: string;
};

/**
 * Subscription checkout summary. Ticket checkouts moved to
 * PendingCheckoutsBasket/TicketCheckoutSessionCard (the multi-checkout
 * order-summary basket) — subscriptions stay a single, standalone purchase
 * with no basket/selection concept, so this stays a plain single-session
 * summary.
 */
export default function OrderSummary({ orderSummary }: OrderSummaryProps) {
  const { planName, totalAmount } = orderSummary;

  return (
    <div className="border border-border rounded-2xl shadow-lg p-6 space-y-4 bg-card text-card-foreground">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-lg text-card-foreground">
          Subscription Summary
        </h2>
      </div>

      <div className="text-sm text-muted-foreground">
        <p className="font-medium">Plan:</p>
        <p className="text-card-foreground font-semibold">{planName}</p>
      </div>

      <div className="flex justify-between pt-2 border-t border-border font-bold text-card-foreground">
        <p>Total Amount</p>
        <p>₵{totalAmount}</p>
      </div>
    </div>
  );
}
