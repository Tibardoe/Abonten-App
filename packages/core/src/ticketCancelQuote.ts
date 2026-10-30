import type { TicketCancelQuote } from "@abonten/types/ticketType";
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
  if (!quote.paid) {
    return {
      body: t("ticketCancel.free"),
      confirm: t("ticketCancel.confirmOne"),
      keep: t("ticketCancel.keepOne"),
      wholePayment: false,
    };
  }
  if (quote.checkedIn) {
    return {
      body: t("ticketCancel.checkedIn"),
      confirm: null,
      keep: t("ticketCancel.keepOne"),
      wholePayment: false,
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
  };
}
