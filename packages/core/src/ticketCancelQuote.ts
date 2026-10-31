import type {
  EventCancelQuote,
  TicketCancelQuote,
} from "@abonten/types/ticketType";
import type { CoreI18n } from "./i18n/translator";
import { formatMoney } from "./money/formatMoney";

// What cancelling a ticket gives back, asked of the server before the
// cancel dialog opens (ticketCancelQuoteCore), and the words that dialog
// shows on the website and in the app. A cash payment is refunded ticket
// by ticket ("one friend can't come": that ticket's price back, the others
// stay valid); a payment made with Abonten Credit or paid small small is
// refunded only as a whole, so its tickets are cancelled together.

export type TicketCancelDialog = {
  body: string;
  /** The confirm button; null when the ticket can't be cancelled. */
  confirm: string | null;
  keep: string;
  /** Cancelling takes the payment's other tickets with it. */
  wholePayment: boolean;
  /** "Cancel all N for this event": the buyer holds more than this ticket
   *  for the event (eventCancelDialog then says what that gives back). */
  allForEvent: string | null;
};

function refundSentence(
  { locale, t }: CoreI18n,
  refund: TicketCancelQuote["refund"],
): string {
  if (!refund) return t("ticketCancel.refundUnknown");
  const amount = (minor: number) =>
    formatMoney({ amountMinor: minor, currency: refund.currency }, { locale });
  if (refund.cashMinor > 0 && refund.creditMinor > 0) {
    return t("ticketCancel.refundBoth", {
      cash: amount(refund.cashMinor),
      credit: amount(refund.creditMinor),
    });
  }
  if (refund.creditMinor > 0) {
    return t("ticketCancel.refundCredit", {
      amount: amount(refund.creditMinor),
    });
  }
  return t("ticketCancel.refundCash", { amount: amount(refund.cashMinor) });
}

export function ticketCancelDialog(
  i18n: CoreI18n,
  quote: TicketCancelQuote,
): TicketCancelDialog {
  const { t } = i18n;
  const allForEvent =
    quote.eventTicketCount > 1 && quote.otherTicketIds.length === 0
      ? t("ticketCancel.cancelAllForEvent", { count: quote.eventTicketCount })
      : null;
  if (!quote.paid) {
    return {
      body: t("ticketCancel.free"),
      confirm: t("ticketCancel.confirmOne"),
      keep: t("ticketCancel.keepOne"),
      wholePayment: false,
      allForEvent,
    };
  }
  if (quote.checkedIn) {
    return {
      body: t("ticketCancel.checkedIn"),
      confirm: null,
      keep: t("ticketCancel.keepOne"),
      wholePayment: false,
      allForEvent,
    };
  }
  const others = quote.otherTicketIds.length;
  if (others === 0) {
    const refund = refundSentence(i18n, quote.refund);
    return {
      body:
        quote.keptTicketCount > 0
          ? `${refund} ${t("ticketCancel.othersStayValid", { count: quote.keptTicketCount })}`
          : refund,
      confirm: t("ticketCancel.confirmOne"),
      keep: t("ticketCancel.keepOne"),
      wholePayment: false,
      allForEvent,
    };
  }
  const together = t(
    quote.otherEvents
      ? "ticketCancel.togetherOtherEvents"
      : "ticketCancel.together",
    { count: others },
  );
  return {
    body: `${together} ${refundSentence(i18n, quote.refund)}`,
    confirm: t("ticketCancel.confirmAll", { count: others + 1 }),
    keep: t("ticketCancel.keepAll"),
    wholePayment: true,
    allForEvent: null,
  };
}

export type EventCancelDialog = {
  title: string;
  body: string;
  /** Null when they can't all be cancelled (the body says why). */
  confirm: string | null;
  keep: string;
};

/** The words for cancelling all of the buyer's tickets for an event. */
export function eventCancelDialog(
  i18n: CoreI18n,
  quote: EventCancelQuote,
): EventCancelDialog {
  const { t } = i18n;
  const count = quote.ticketIds.length;
  const title = t("ticketCancel.eventTitle");
  const keep = t("ticketCancel.keepAll");
  if (quote.blocked === "other_events") {
    return {
      title,
      body: t("ticketCancel.eventOtherEvents"),
      confirm: null,
      keep,
    };
  }
  if (quote.blocked === "checked_in") {
    return { title, body: t("ticketCancel.checkedIn"), confirm: null, keep };
  }
  const confirm = t("ticketCancel.confirmEvent", { count });
  if (!quote.paid) {
    return {
      title,
      body: t("ticketCancel.eventFree", { count }),
      confirm,
      keep,
    };
  }
  return {
    title,
    body: `${t("ticketCancel.eventAll", { count })} ${refundSentence(i18n, quote.refund)}`,
    confirm,
    keep,
  };
}
