import { logger } from "@abonten/core/logger";
import { fromMajor } from "@abonten/core/money/money";
import type { Database } from "@abonten/types/database.types";
import type { TicketCancelQuote } from "@abonten/types/ticketType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tr } from "../i18n/requestLocale";
import {
  refundsTicketByTicket,
  tenderSplit,
} from "../organizer/issueRefundCore";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { ticketsOfPayment } from "./ticketsOfPayment";

// What cancelling one of the caller's tickets would give back, before
// anything moves: the cancel dialog says it in so many words (the web
// action getTicketCancelQuote and POST /api/mobile/tickets/cancel/quote run
// this). The amount is the one issueRefundCore would refund, never the
// service fee: on a cash payment this ticket's share of its checkout line
// (refund_quote_amount), on one refunded only as a whole the ticket price
// of everything the payment bought.

export type TicketCancelQuoteResult =
  | { status: 200; data: TicketCancelQuote }
  | { status: 404 | 409 | 500; message: string };

type TicketRow = {
  id: string;
  status: string;
  transaction_id: string | null;
  ticket_type: { event_id: string } | null;
};

export async function ticketCancelQuoteCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  ticketId: string,
): Promise<TicketCancelQuoteResult> {
  const { data: rawTicket, error: ticketError } = await supabase
    .from("ticket")
    .select("id, status, transaction_id, ticket_type:ticket_type_id(event_id)")
    .eq("id", ticketId)
    .eq("user_id", userId)
    .maybeSingle();
  if (ticketError || !rawTicket) {
    if (ticketError) {
      logger.error(`Failed reading ticket for a quote: ${ticketError.message}`);
    }
    return { status: 404, message: tr("ticketNotFound") };
  }
  const ticket = rawTicket as unknown as TicketRow;
  if (ticket.status === "used") {
    return { status: 409, message: tr("thisTicketHasAlreadyBeenChecked") };
  }
  if (ticket.status !== "active") {
    return { status: 409, message: tr("thisTicketIsAlreadyCancelled") };
  }

  const quote: TicketCancelQuote = {
    paid: false,
    otherTicketIds: [],
    keptTicketCount: 0,
    otherEvents: false,
    checkedIn: false,
    refund: null,
  };
  if (!ticket.transaction_id) return { status: 200, data: quote };

  const { data: payment, error: paymentError } = await supabase
    .from("transaction")
    .select("id, status, amount, credit_amount, currency, provider")
    .eq("id", ticket.transaction_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (paymentError) {
    logger.error(`Failed reading payment for a quote: ${paymentError.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (
    !payment ||
    Number(payment.amount ?? 0) + Number(payment.credit_amount ?? 0) <= 0
  ) {
    return { status: 200, data: quote };
  }
  quote.paid = true;

  const tickets = await ticketsOfPayment(supabase, payment.id);
  if (!tickets) return { status: 500, message: tr("somethingWentWrong") };
  const eventId = ticket.ticket_type?.event_id ?? null;
  const others = tickets.filter(
    (t) => t.id !== ticket.id && t.status === "active",
  );

  if (refundsTicketByTicket(payment)) {
    // This ticket alone; the others stay valid.
    quote.keptTicketCount = others.length;
    if (payment.status === "successful") {
      const { data: amount, error: amountError } =
        await getSupabaseServiceClient().rpc("refund_quote_amount", {
          p_transaction_id: payment.id,
          p_ticket_ids: [ticket.id],
        });
      if (amountError) {
        logger.error(
          `Failed pricing a ticket's refund for a quote: ${amountError.message}`,
        );
      } else {
        const cashMinor = fromMajor(
          Number(amount ?? 0),
          payment.currency,
        ).amountMinor;
        quote.refund = {
          cashMinor,
          creditMinor: 0,
          currency: payment.currency,
        };
      }
    }
    return { status: 200, data: quote };
  }

  quote.otherTicketIds = others.map((t) => t.id);
  quote.otherEvents = others.some((t) => t.eventId !== eventId);
  quote.checkedIn = tickets.some((t) => t.status === "used");

  if (payment.status === "successful") {
    // Service role: the function answers for any payment (migration
    // refundable_amount_service_only); this one is the caller's own.
    const { data: refundable, error: refundableError } =
      await getSupabaseServiceClient().rpc(
        "get_transaction_refundable_amount",
        { p_transaction_id: payment.id },
      );
    if (refundableError) {
      logger.error(
        `Failed computing the refundable amount for a quote: ${refundableError.message}`,
      );
    } else {
      const refundableMinor = fromMajor(
        Number(refundable ?? 0),
        payment.currency,
      ).amountMinor;
      if (refundableMinor > 0) {
        const split = tenderSplit(payment, refundableMinor);
        quote.refund = {
          cashMinor: split.cashBackMinor,
          creditMinor: split.creditBackMinor,
          currency: payment.currency,
        };
      }
    }
  }
  return { status: 200, data: quote };
}
