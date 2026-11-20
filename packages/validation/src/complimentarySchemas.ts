import { z } from "zod";
import { sendTicketTargetSchema } from "./ticketTransferSchemas";

// Complimentary tickets (docs/architecture/complimentary-tickets.md): the
// shape both transports accept. Who gives them is proved by the transport.

export const giveComplimentaryTicketsSchema = z.object({
  eventId: z.string().uuid(),
  ticketTypeId: z.string().uuid(),
  /** Purchases of the type (a Couple counts once). */
  quantity: z.number().int().min(1).max(40),
  occurrenceId: z.string().uuid().nullish(),
  target: sendTicketTargetSchema,
  note: z.string().trim().max(200).nullish(),
});
export type GiveComplimentaryTicketsInput = z.infer<
  typeof giveComplimentaryTicketsSchema
>;
