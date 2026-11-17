// What happened to an unpaid order's latest try at paying, as the buyer's
// order history reports it (get_user_transaction_history.payment_state,
// migration 20261117130933). A code decides; the apps show the matching
// message from the "transactions" catalog.

export type OrderPaymentState =
  /** Charge sent, the provider has not confirmed it yet. */
  | "awaiting"
  /** Paid; the tickets are not issued yet. */
  | "finishing"
  /** Declined or abandoned at the provider: nothing was charged. */
  | "failed"
  /** Closed before it was paid (money taken later is refunded in full). */
  | "not_completed";

const STATES = new Set<string>([
  "awaiting",
  "finishing",
  "failed",
  "not_completed",
]);

/** The state from a history row, or null (paid, free, or never started). */
export function orderPaymentState(value: unknown): OrderPaymentState | null {
  return typeof value === "string" && STATES.has(value)
    ? (value as OrderPaymentState)
    : null;
}

/** Its sentence in the "transactions" message catalog. */
export const ORDER_PAYMENT_STATE_MESSAGE: Record<OrderPaymentState, string> = {
  awaiting: "paymentBeingConfirmed",
  finishing: "paymentReceivedTicketsOnTheWay",
  failed: "paymentDidNotGoThroughNotCharged",
  not_completed: "paymentNotCompletedMoneyReturned",
};

/** How the line reads: a problem, something in progress, or settled. */
export const ORDER_PAYMENT_STATE_TONE: Record<
  OrderPaymentState,
  "warning" | "info" | "danger" | "muted"
> = {
  awaiting: "warning",
  finishing: "info",
  failed: "danger",
  not_completed: "muted",
};
