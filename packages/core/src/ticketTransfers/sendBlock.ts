import type { TicketSendBlock } from "@abonten/types/ticketTransferType";

/**
 * The `tickets` message that explains why a ticket cannot be sent, for the
 * blocks a holder can still see the ticket under. Null where the send
 * control is simply not shown (programme closed to the person, ticket not
 * live), so no reason is needed.
 */
export function ticketSendBlockMessageKey(
  block: TicketSendBlock | null,
):
  | "sendBlockedOrganizerOff"
  | "sendBlockedTooManyMoves"
  | "sendBlockedRestricted"
  | "sendBlockedPartnerGate"
  | null {
  switch (block) {
    case "organizer_off":
      return "sendBlockedOrganizerOff";
    case "too_many_moves":
      return "sendBlockedTooManyMoves";
    case "restricted":
      return "sendBlockedRestricted";
    case "partner_gate":
      return "sendBlockedPartnerGate";
    default:
      return null;
  }
}
