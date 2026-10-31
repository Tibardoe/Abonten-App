import type { CoreTranslator } from "./i18n/translator";

// Maps a transaction.status value (plus refund_requested_at) to a
// user-facing refund label — shared by the ticket card (My Events) and the
// transactions list/detail pages so the wording/colors for
// "refund pending/issued/failed/deferred" never drift between them. Only
// meaningful for a transaction linked to a CANCELLED ticket. Words live
// under `refundStatus.*` of the core namespace.
//
// A cash payment is refunded ticket by ticket (2026-10-30): each cancelled
// ticket has its own refund (transaction_refund) while the payment stays
// "successful", so a ticket's state comes from that refund first
// (ticketRefundState). Without one (a payment refunded only as a whole, or a
// ticket cancelled before 2026-10-30), the payment's state speaks for it:
// at "successful", refund_requested_at tells "not requested yet" (null)
// from "requested and failed" (set — the request failed, or the provider
// later reported refund.failed).
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

/** A cancelled ticket's own refund (transaction_refund via TICKET_*_SELECT). */
export type TicketRefundPart = {
  status: string;
  /** The whole part: it can cover several tickets cancelled together. */
  amount: number;
  currency: string;
  created_at: string;
  tickets?: { ticket_id: string }[];
};

export type TicketRefundState = {
  /** In the payment-status terms the functions above read. */
  status: string;
  refundRequestedAt: string | null;
  /** This ticket's refund when it has its own, else the payment's amount. */
  amount: number | null;
  currency: string | null;
};

/**
 * The refund state of one cancelled ticket: its own latest refund when the
 * payment is refunded ticket by ticket, else its payment's.
 */
export function ticketRefundState(ticket: {
  transaction: {
    status: string;
    refund_requested_at: string | null;
    amount?: number | null;
    currency?: string | null;
  } | null;
  refund_parts?: { refund: TicketRefundPart | null }[] | null;
}): TicketRefundState | null {
  const latest = (ticket.refund_parts ?? [])
    .map((part) => part.refund)
    .filter((refund): refund is TicketRefundPart => refund !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (latest) {
    return {
      status:
        latest.status === "processed"
          ? "refunded"
          : latest.status === "failed"
            ? "successful"
            : "refund_pending",
      refundRequestedAt: latest.created_at,
      // This ticket's share: two tickets cancelled together are one part
      // of GH₵80, shown as GH₵40 on each.
      amount: Number(latest.amount) / Math.max(latest.tickets?.length ?? 1, 1),
      currency: latest.currency,
    };
  }
  if (!ticket.transaction) return null;
  return {
    status: ticket.transaction.status,
    refundRequestedAt: ticket.transaction.refund_requested_at,
    amount: ticket.transaction.amount ?? null,
    currency: ticket.transaction.currency ?? null,
  };
}

/**
 * One refund state for several cancelled tickets (a purchase line): a
 * failed refund first (it needs the buyer), then one on its way, then
 * refunded, then not asked for.
 */
export function combinedRefundState(
  states: (TicketRefundState | null)[],
): TicketRefundState | null {
  const order: Record<RefundStatusKind, number> = {
    failed: 0,
    pending: 1,
    issued: 2,
    none: 3,
  };
  const rank = (state: TicketRefundState) => {
    const kind = getRefundStatusKind(state.status, state.refundRequestedAt);
    return kind ? order[kind] : 4;
  };
  return (
    states
      .filter((state): state is TicketRefundState => state !== null)
      .sort((a, b) => rank(a) - rank(b))[0] ?? null
  );
}
