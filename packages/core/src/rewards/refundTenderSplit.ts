// How a refund of an order paid partly with Abonten Credit is returned:
// the credit share goes back as credit, the cash share through Paystack.
// Pro rata to how the order was paid, so a customer who paid 30% with
// credit gets 30% of the refund back as credit. The Abonten service fee is
// retained either way (the refund covers ticket revenue only).
//
// Every amount is integer pesewas.

export type RefundTenderInput = {
  /** What is being refunded (ticket revenue for the cancelled tickets). */
  refundMinor: number;
  /** Cash Paystack collected for the order. */
  cashMinor: number;
  /** Credit that paid for the order. */
  creditMinor: number;
};

export type RefundTenderSplit = {
  creditBackMinor: number;
  cashBackMinor: number;
};

function whole(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function splitRefundTender(input: RefundTenderInput): RefundTenderSplit {
  const cash = whole(input.cashMinor);
  const credit = whole(input.creditMinor);
  const refund = Math.min(whole(input.refundMinor), cash + credit);
  if (refund === 0) return { creditBackMinor: 0, cashBackMinor: 0 };
  if (credit === 0) return { creditBackMinor: 0, cashBackMinor: refund };
  if (cash === 0) return { creditBackMinor: refund, cashBackMinor: 0 };

  let creditBack = Math.round((refund * credit) / (cash + credit));
  creditBack = Math.min(creditBack, credit, refund);
  let cashBack = refund - creditBack;
  // Never ask Paystack to refund more cash than it collected.
  if (cashBack > cash) {
    creditBack += cashBack - cash;
    cashBack = cash;
  }
  return { creditBackMinor: creditBack, cashBackMinor: cashBack };
}
