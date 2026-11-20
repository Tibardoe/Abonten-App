import { logger } from "@abonten/core/logger";
import { fromMajor } from "@abonten/core/money/money";
import type { Database } from "@abonten/types/database.types";
import type { EventCancelQuote } from "@abonten/types/ticketType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tr } from "../i18n/requestLocale";
import {
  issueRefundCore,
  refundsTicketByTicket,
  tenderSplit,
} from "../organizer/issueRefundCore";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { buyerCancelGate } from "./buyerCancelGate";
import {
  type CancelTarget,
  releaseCancelledTickets,
} from "./cancelUserTicketCore";
import { ticketsOfPayment } from "./ticketsOfPayment";

// "Cancel all my tickets for this event": every active ticket the caller
// holds for it, across every payment they bought them in. Each payment then
// refunds what was just cancelled — a cash payment those tickets' share, a
// payment refunded only as a whole (Abonten Credit, Pay small small) all of
// its tickets, which is why such a payment that also paid for another
// event's tickets, or one with a checked-in ticket, stops the whole action.
// The web actions getEventCancelQuote / cancelEventTickets and
// POST /api/mobile/tickets/cancel-event[/quote] run this.

/**
 * After the organizer moved the event (rescheduleRefundCore): the event's
 * refund policy does not apply, and a cash payment's refund includes the
 * tickets' share of the service fee (ticket.refund_includes_fee, read by
 * refund_prepare). Payments with Abonten Credit or Pay small small keep
 * their whole-payment rules.
 */
export type EventCancelOptions = { afterReschedule?: boolean };

type TicketRow = {
  id: string;
  transaction_id: string | null;
  ticket_type_id: string;
  ticket_checkout_id: string | null;
};

type PaymentRow = {
  id: string;
  status: string;
  amount: number;
  credit_amount: number | null;
  currency: string;
  provider: string;
};

type Plan =
  | { ok: false; status: 404 | 409 | 500; message: string }
  | {
      ok: true;
      targets: CancelTarget[];
      /** Paid payments the targets belong to, with their target ids. */
      payments: { payment: PaymentRow; ticketIds: string[]; whole: boolean }[];
      blocked: EventCancelQuote["blocked"];
    };

async function planEventCancel(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  options: EventCancelOptions = {},
): Promise<Plan> {
  const { data, error } = await supabase
    .from("ticket")
    .select(
      "id, transaction_id, ticket_type_id, ticket_checkout_id, ticket_type:ticket_type_id!inner(event_id)",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("ticket_type.event_id", eventId);
  if (error) {
    logger.error(`Failed listing an event's tickets: ${error.message}`);
    return { ok: false, status: 500, message: tr("somethingWentWrong") };
  }
  const tickets = (data ?? []) as unknown as TicketRow[];
  if (tickets.length === 0) {
    return {
      ok: false,
      status: 404,
      message: tr("noActiveTicketsForThisEvent"),
    };
  }

  const paymentIds = Array.from(
    new Set(
      tickets.map((t) => t.transaction_id).filter((id): id is string => !!id),
    ),
  );
  const payments: Extract<Plan, { ok: true }>["payments"] = [];
  let blocked: EventCancelQuote["blocked"] = null;
  let rows: PaymentRow[] = [];
  if (paymentIds.length > 0) {
    const { data, error: paymentError } = await supabase
      .from("transaction")
      .select("id, status, amount, credit_amount, currency, provider")
      .in("id", paymentIds)
      .eq("user_id", userId);
    if (paymentError) {
      logger.error(`Failed reading payments: ${paymentError.message}`);
      return { ok: false, status: 500, message: tr("somethingWentWrong") };
    }
    rows = (data ?? []) as PaymentRow[];
  }

  // A ticket someone else paid for was sent to the caller: its refund is
  // theirs, so cancelling it here would put the seat back with nothing
  // returned. Those are left out; the holder sends them back instead.
  const ownPayments = new Set(rows.map((r) => r.id));
  const mine = tickets.filter(
    (t) => !t.transaction_id || ownPayments.has(t.transaction_id),
  );
  if (mine.length === 0) {
    return {
      ok: false,
      status: 409,
      message: tr("ticketTransferCancelSendBack"),
    };
  }
  const targets: CancelTarget[] = mine.map((t) => ({
    id: t.id,
    ticketTypeId: t.ticket_type_id,
    checkoutId: t.ticket_checkout_id,
    eventId,
  }));

  // The event's refund policy, or a show that has started: one ticket the
  // buyer may not cancel stops the whole "cancel all" (they share a policy;
  // only a multi-date event's dates differ).
  // After a move the holder may give tickets back whatever the policy says.
  const refusal = options.afterReschedule
    ? null
    : await buyerCancelGate(targets.map((t) => t.id));
  if (refusal) {
    return { ok: false, status: refusal.status, message: refusal.message };
  }

  if (rows.length > 0) {
    const ours = new Set(mine.map((t) => t.id));
    for (const payment of rows) {
      if (Number(payment.amount) + Number(payment.credit_amount ?? 0) <= 0) {
        continue;
      }
      const whole = !refundsTicketByTicket(payment);
      if (whole) {
        const all = await ticketsOfPayment(supabase, payment.id);
        if (!all) {
          return { ok: false, status: 500, message: tr("somethingWentWrong") };
        }
        if (all.some((t) => t.status === "active" && !ours.has(t.id))) {
          blocked = "other_events";
        } else if (all.some((t) => t.status === "used")) {
          blocked = blocked ?? "checked_in";
        }
      }
      payments.push({
        payment,
        whole,
        ticketIds: mine
          .filter((t) => t.transaction_id === payment.id)
          .map((t) => t.id),
      });
    }
  }
  return { ok: true, targets, payments, blocked };
}

export type EventCancelQuoteResult =
  | { status: 200; data: EventCancelQuote }
  | { status: 404 | 409 | 500; message: string };

/** What cancelling all of the caller's tickets for an event gives back. */
export async function eventCancelQuoteCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  options: EventCancelOptions = {},
): Promise<EventCancelQuoteResult> {
  const plan = await planEventCancel(supabase, userId, eventId, options);
  if (!plan.ok) return { status: plan.status, message: plan.message };

  const service = getSupabaseServiceClient();
  let cashMinor = 0;
  let creditMinor = 0;
  let currency: string | null = null;
  let priced = true;
  for (const { payment, ticketIds, whole } of plan.payments) {
    if (payment.status !== "successful") continue;
    currency = currency ?? payment.currency;
    // Service role: both functions answer for any payment; these are the
    // caller's own.
    const { data: amount, error } = whole
      ? await service.rpc("get_transaction_refundable_amount", {
          p_transaction_id: payment.id,
        })
      : await service.rpc(
          options.afterReschedule
            ? "refund_quote_amount_with_fee"
            : "refund_quote_amount",
          { p_transaction_id: payment.id, p_ticket_ids: ticketIds },
        );
    if (error) {
      logger.error(`Failed pricing an event's refund: ${error.message}`);
      priced = false;
      continue;
    }
    const minor = fromMajor(Number(amount ?? 0), payment.currency).amountMinor;
    if (whole) {
      const split = tenderSplit(
        { ...payment, credit_amount: Number(payment.credit_amount ?? 0) },
        minor,
      );
      cashMinor += split.cashBackMinor;
      creditMinor += split.creditBackMinor;
    } else {
      cashMinor += minor;
    }
  }

  return {
    status: 200,
    data: {
      ticketIds: plan.targets.map((t) => t.id),
      paid: plan.payments.length > 0,
      refund: priced && currency ? { cashMinor, creditMinor, currency } : null,
      blocked: plan.blocked,
    },
  };
}

export type CancelEventTicketsResult = {
  status: number;
  message: string;
  cancelled?: number;
};

/** Cancels every active ticket the caller holds for an event. */
export async function cancelEventTicketsCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  options: EventCancelOptions = {},
): Promise<CancelEventTicketsResult> {
  const plan = await planEventCancel(supabase, userId, eventId, options);
  if (!plan.ok) return { status: plan.status, message: plan.message };
  if (plan.blocked === "other_events") {
    return { status: 409, message: tr("someOfTheseTicketsWerePaidTogether") };
  }
  if (plan.blocked === "checked_in") {
    return { status: 409, message: tr("aTicketFromThisPaymentWasChecked") };
  }

  // Compare-and-set, as for one ticket: a ticket a gate scan or another
  // request got to first is left out.
  const service = getSupabaseServiceClient();
  const flipped: CancelTarget[] = [];
  for (const target of plan.targets) {
    const { data: rows, error } = await service
      .from("ticket")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
        ...(options.afterReschedule ? { refund_includes_fee: true } : {}),
      })
      .eq("id", target.id)
      .eq("user_id", userId)
      .eq("status", "active")
      .select("id");
    if (error) {
      logger.error(`Error cancelling ticket ${target.id}: ${error.message}`);
      break;
    }
    if (rows && rows.length > 0) flipped.push(target);
  }
  if (flipped.length === 0) {
    return { status: 500, message: tr("somethingWentWrong") };
  }

  // Each payment refunds what was just cancelled (a whole one, all of it).
  let refundMessage: string | null = null;
  const done = new Set(flipped.map((t) => t.id));
  for (const { payment, ticketIds } of plan.payments) {
    if (!ticketIds.some((id) => done.has(id))) continue;
    const response = await issueRefundCore(supabase, payment.id, {
      expectedUserId: userId,
    });
    if (response.status === 200)
      refundMessage = refundMessage ?? response.message;
  }

  await releaseCancelledTickets(supabase, userId, flipped);

  return {
    status: 200,
    cancelled: flipped.length,
    message: refundMessage
      ? tr("ticketsCancelledRefund", {
          count: flipped.length,
          refundMessage,
        })
      : tr("eventTicketsCancelled", { count: flipped.length }),
  };
}
