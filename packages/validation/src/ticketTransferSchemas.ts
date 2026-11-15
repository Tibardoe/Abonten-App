import { z } from "zod";

// Send a ticket to a friend: the inputs of the web Server Actions and of
// /api/mobile/tickets/** (docs/architecture/ticket-transfers.md). Who is
// asking is never in a payload: the transport proves it.

const uuid = z.string().uuid("Invalid id");

export const sendTicketTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("username"),
    username: z.string().trim().min(1).max(41),
  }),
  z.object({
    kind: z.literal("phone"),
    phone: z.string().trim().min(3).max(32),
  }),
]);

export const ticketTransferRecipientSchema = z.object({
  target: sendTicketTargetSchema,
});

export const sendTicketSchema = z.object({
  ticketId: uuid,
  target: sendTicketTargetSchema,
});
export type SendTicketInput = z.infer<typeof sendTicketSchema>;

export const ticketTransferIdSchema = z.object({ transferId: uuid });

export const ticketIdSchema = z.object({ ticketId: uuid });

export const eventIdOnlySchema = z.object({ eventId: uuid });

export const eventTicketTransferSettingSchema = z.object({
  eventId: uuid,
  enabled: z.boolean(),
});

// ── Admin ───────────────────────────────────────────────────────────

const reason = z
  .string()
  .trim()
  .min(5, "Give a short reason for this change")
  .max(500);

export const ticketTransferSettingsSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  reason,
  patch: z
    .object({
      enabled: z.boolean(),
      audience: z.enum(["staff", "beta", "all"]),
      betaUserIds: z.array(uuid).max(500),
      maxMoves: z.number().int().min(1).max(10),
      acceptHours: z.number().int().min(1).max(336),
      textsPerSenderPerDay: z.number().int().min(0).max(200),
    })
    .partial(),
});
export type TicketTransferSettingsInput = z.infer<
  typeof ticketTransferSettingsSchema
>;
