/**
 * A paid ticket someone sent to its holder: its refund belongs to whoever
 * paid, so the holder is offered "send it back", never "cancel and refund"
 * (the server refuses that with 409 ticketTransferCancelSendBack anyway).
 *
 * A paid ticket is issued to the account that paid for it, so `issued_to`
 * names the payer; a ticket sent back to them is theirs to refund again.
 * A free ticket has no payment, so its holder may always give it up.
 */
export function isTicketPaidBySomeoneElse(ticket: {
  user_id: string;
  transaction_id: string | null;
  issued_to?: string | null;
}): boolean {
  return (
    !!ticket.transaction_id &&
    !!ticket.issued_to &&
    ticket.issued_to !== ticket.user_id
  );
}
