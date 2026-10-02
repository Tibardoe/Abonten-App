import type { CoreTranslator } from "./i18n/translator";

// Maps a transaction.status value (plus refund_requested_at) to a
// user-facing refund label — shared by the ticket card (My Events) and the
// transactions list/detail pages so the wording/colors for
// "refund pending/issued/failed/deferred" never drift between them. Only
// meaningful for a transaction linked to a CANCELLED ticket. Words live
// under `refundStatus.*` of the core namespace.
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
export type RefundStatusKind = "pending" | "issued" | "failed" | "none";

/** Which of the four refund states applies, or null when none does. */
export function getRefundStatusKind(
  transactionStatus: string,
  refundRequestedAt?: string | null,
): RefundStatusKind | null {
  switch (transactionStatus) {
    case "refund_pending":
      return "pending";
    case "refunded":
      return "issued";
    case "successful":
      return refundRequestedAt ? "failed" : "none";
    default:
      return null;
  }
}

export function getRefundStatusLabel(
  t: CoreTranslator,
  transactionStatus: string,
  refundRequestedAt?: string | null,
): { label: string; className: string; description?: string } | null {
  switch (transactionStatus) {
    case "refund_pending":
      return { label: t("refundStatus.pending"), className: "text-amber-600" };
    case "refunded":
      return { label: t("refundStatus.issued"), className: "text-green-600" };
    case "successful":
      return refundRequestedAt
        ? { label: t("refundStatus.failed"), className: "text-destructive" }
        : {
            label: t("refundStatus.none"),
            className: "text-muted-foreground",
            description: t("refundStatus.noneDescription"),
          };
    default:
      return null;
  }
}
