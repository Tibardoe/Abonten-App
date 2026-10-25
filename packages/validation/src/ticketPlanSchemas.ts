import { z } from "zod";

// Pay small small inputs: the buyer's plan screens (web Server Actions and
// /api/mobile/ticket-plans/**), the organizer's switch and the admin
// console. Who is asking is never in a payload: the transport proves it.
// Codes mirror the CHECK constraints in
// supabase/migrations/20261025100000_ticket_plans.sql.

const uuid = z.string().uuid("Invalid id");

export const ticketPlanOfferSchema = z.object({
  eventId: uuid,
  occurrenceId: uuid.nullable().optional(),
});
export type TicketPlanOfferInput = z.infer<typeof ticketPlanOfferSchema>;

export const startTicketPlanSchema = z.object({
  eventId: uuid,
  occurrenceId: uuid.nullable().optional(),
  quantities: z.record(uuid, z.number().int().min(0).max(50)),
});
export type StartTicketPlanSchemaInput = z.infer<typeof startTicketPlanSchema>;

export const payTicketPlanPartSchema = z.object({
  planId: uuid,
  amountMinor: z.number().int().positive(),
  paymentMethodId: uuid.nullable().optional(),
  method: z.string().max(40).nullable().optional(),
  platform: z.enum(["web", "ios", "android"]).nullable().optional(),
});
export type PayTicketPlanPartSchemaInput = z.infer<
  typeof payTicketPlanPartSchema
>;

export const ticketPlanIdSchema = z.object({ planId: uuid });
export type TicketPlanIdInput = z.infer<typeof ticketPlanIdSchema>;

export const eventTicketPlanSettingSchema = z.object({
  eventId: uuid,
  enabled: z.boolean(),
});
export type EventTicketPlanSettingInput = z.infer<
  typeof eventTicketPlanSettingSchema
>;

// ── Admin ───────────────────────────────────────────────────────────

const reason = z
  .string()
  .trim()
  .min(5, "Give a short reason for this change")
  .max(500);

export const ticketPlanSettingsSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  reason,
  patch: z
    .object({
      enabled: z.boolean(),
      audience: z.enum(["staff", "beta", "all"]),
      betaUserIds: z.array(uuid).max(500),
      firstPartMinBps: z.number().int().min(500).max(10_000),
      partMinBps: z.number().int().min(100).max(10_000),
      deadlineHoursBeforeStart: z.number().int().min(1).max(720),
      minDaysToDeadline: z.number().int().min(1).max(60),
      holdMinutes: z.number().int().min(10).max(240),
      maxTicketsPerPlan: z.number().int().min(1).max(20),
      keepFeeOnRefund: z.boolean(),
      reminderDays: z.array(z.number().int().min(1).max(60)).max(5),
    })
    .strict()
    .partial(),
});
export type TicketPlanSettingsInput = z.infer<typeof ticketPlanSettingsSchema>;

export const ticketPlanAdminListSchema = z.object({
  status: z
    .enum([
      "awaiting_payment",
      "active",
      "settling",
      "completed",
      "expired",
      "lapsed",
      "cancelled",
    ])
    .optional(),
  refund: z.enum(["pending", "failed"]).optional(),
  userId: uuid.optional(),
  eventId: uuid.optional(),
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type TicketPlanAdminListInput = z.infer<
  typeof ticketPlanAdminListSchema
>;

export const ticketPlanAdminPartRefundSchema = z.object({
  paymentId: uuid,
  action: z.enum(["retry", "mark_done"]),
  reason,
});
export type TicketPlanAdminPartRefundInput = z.infer<
  typeof ticketPlanAdminPartRefundSchema
>;

export const ticketPlanAdminEndSchema = z.object({
  planId: uuid,
  reason,
});
export type TicketPlanAdminEndInput = z.infer<typeof ticketPlanAdminEndSchema>;
