// Maps a transaction.status value to a user-facing refund label — shared by
// the ticket card (My Events) and the transactions list/detail pages so the
// wording/colors for "refund pending/issued/failed" never drift between
// them. Only meaningful for a transaction linked to a CANCELLED ticket —
// cancelUserTicket.ts always attempts a refund when one exists, so a
// cancelled ticket's transaction still sitting at "successful" means a
// refund was tried but never completed (the initial API call failed, or
// Paystack later reported refund.failed — see the webhook route), not that
// no refund was ever requested.
export function getRefundStatusLabel(
  transactionStatus: string,
): { label: string; className: string } | null {
  switch (transactionStatus) {
    case "refund_pending":
      return { label: "Refund pending", className: "text-amber-600" };
    case "refunded":
      return { label: "Refund issued", className: "text-green-600" };
    case "successful":
      return { label: "Refund failed", className: "text-destructive" };
    default:
      return null;
  }
}
