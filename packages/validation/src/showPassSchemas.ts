import { z } from "zod";

// Passes for several shows of a run (docs/architecture/show-passes.md): the
// shapes both transports accept. Who asks is proved by the transport.

export const addShowPassSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  /** Shows the pass covers, the one it is bought for included. */
  shows: z.number().int().min(2).max(30),
  price: z.number().positive(),
  /** Passes each show takes; null = no limit of its own. */
  quantity: z.number().int().min(1).nullable(),
});
export type AddShowPassInput = z.infer<typeof addShowPassSchema>;

export const claimShowPassSchema = z.object({
  ticketId: z.string().uuid(),
  eventId: z.string().uuid(),
});
export type ClaimShowPassInput = z.infer<typeof claimShowPassSchema>;
