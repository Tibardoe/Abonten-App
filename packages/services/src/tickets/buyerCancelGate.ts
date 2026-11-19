import { logger } from "@abonten/core/logger";
import {
  type BuyerCancelRefusal,
  type RefundPolicy,
  buyerCancelDecision,
  refundCutoffDays,
  refundPolicyOf,
  ticketShowStart,
} from "@abonten/core/refundPolicy";
import { tr } from "../i18n/requestLocale";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// The buyer's side of an event's refund policy (@abonten/core/refundPolicy),
// checked before any buyer cancellation moves a ticket: once the ticket's
// show has started nobody cancels, and a paid ticket only as the event's
// policy allows. Every buyer cancel path asks this first
// (cancelUserTicketCore, cancelEventTicketsCore and their quotes), so the
// website, the app and a direct call to the API answer the same. The
// organizer's own cancellations and staff refunds don't come through here.

type Row = {
  id: string;
  occurrence_id: string | null;
  transaction: { amount: number | null; credit_amount: number | null } | null;
  ticket_type: {
    event: {
      starts_at: string | null;
      refund_policy: string | null;
      refund_cutoff_hours: number | null;
      event_occurrence: { id: string; starts_at: string }[] | null;
    } | null;
  } | null;
};

export type BuyerCancelRefused = {
  status: 409;
  reason: BuyerCancelRefusal;
  message: string;
};

export function buyerCancelRefusalMessage(
  reason: BuyerCancelRefusal,
  policy: RefundPolicy,
): string {
  if (reason === "started") return tr("refundShowStarted");
  if (reason === "no_refunds" || policy.kind !== "until_cutoff") {
    return tr("refundNoRefundsEvent");
  }
  return tr("refundCutoffPassed", {
    days: refundCutoffDays(policy.cutoffHours),
  });
}

/**
 * Null when the buyer may cancel every one of these tickets now; else the
 * first refusal, with the sentence to show. Read with the service role:
 * the callers have already checked the tickets are the caller's.
 */
export async function buyerCancelGate(
  ticketIds: string[],
  now: Date = new Date(),
): Promise<BuyerCancelRefused | { status: 500; message: string } | null> {
  if (ticketIds.length === 0) return null;
  const { data, error } = await getSupabaseServiceClient()
    .from("ticket")
    .select(
      "id, occurrence_id, transaction:transaction_id ( amount, credit_amount ), ticket_type:ticket_type_id ( event:event_id ( starts_at, refund_policy, refund_cutoff_hours, event_occurrence ( id, starts_at ) ) )",
    )
    .in("id", ticketIds);
  if (error || !data) {
    logger.error(
      `buyerCancelGate: reading tickets failed (${error?.message ?? "no rows"})`,
    );
    return { status: 500, message: tr("somethingWentWrong") };
  }

  for (const row of data as unknown as Row[]) {
    const event = row.ticket_type?.event;
    if (!event) continue;
    const policy = refundPolicyOf(event);
    const paid =
      !!row.transaction &&
      Number(row.transaction.amount ?? 0) +
        Number(row.transaction.credit_amount ?? 0) >
        0;
    const decision = buyerCancelDecision({
      policy,
      showStart: ticketShowStart({
        occurrenceId: row.occurrence_id,
        eventStartsAt: event.starts_at,
        occurrences: event.event_occurrence,
      }),
      paid,
      now,
    });
    if (!decision.allowed) {
      return {
        status: 409,
        reason: decision.reason,
        message: buyerCancelRefusalMessage(decision.reason, policy),
      };
    }
  }
  return null;
}
