// Maps a transaction.status value (plus refund_requested_at) to a
// user-facing refund label — shared by the ticket card (My Events) and the
// transactions list/detail pages so the wording/colors for
// "refund pending/issued/failed/deferred" never drift between them. Only
// meaningful for a transaction linked to a CANCELLED ticket.
//
// cancelUserTicket.ts defers requesting a refund until every ticket sharing
// a transaction is cancelled (a single Paystack charge can cover multiple
// tickets, ticket types, or even events — see generateTicket.ts — and this
// integration has no per-ticket partial-refund amount, so refunding early
// would refund the whole order while other tickets in it are still active).
// That means a cancelled ticket's transaction sitting at "successful" is
// ambiguous on its own: refund_requested_at disambiguates "not requested
// yet, waiting on the rest of the order" (null) from "requested and failed"
// (set — the initial API call failed, or Paystack later reported
// refund.failed, see the webhook route).
export function getRefundStatusLabel(
  transactionStatus: string,
  refundRequestedAt?: string | null,
): { label: string; className: string; description?: string } | null {
  switch (transactionStatus) {
    case "refund_pending":
      return { label: "Refund pending", className: "text-amber-600" };
    case "refunded":
      return { label: "Refund issued", className: "text-green-600" };
    case "successful":
      return refundRequestedAt
        ? { label: "Refund failed", className: "text-destructive" }
        : {
            label: "No refund yet",
            className: "text-muted-foreground",
            description: "Issued once every ticket in this order is cancelled.",
          };
    default:
      return null;
  }
}
