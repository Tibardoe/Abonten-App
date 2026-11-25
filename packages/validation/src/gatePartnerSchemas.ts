import { z } from "zod";

// Gate partner connectors: the inputs of the organizer's web Server Actions
// and /api/mobile/organizer/events/:eventId/gate-partner, and of Admin ›
// Gate partners (docs/architecture/gate-partner-connectors.md). Who is
// asking is never in a payload: the transport proves it.

const uuid = z.string().uuid("Invalid id");

export const gatePartnerEventSchema = z.object({ eventId: uuid });

export const confirmGatePartnerVoidsSchema = z.object({
  eventId: uuid,
  ticketIds: z.array(uuid).min(1).max(2000),
});

// ── Admin ───────────────────────────────────────────────────────────

const reason = z
  .string()
  .trim()
  .min(5, "Give a short reason for this change")
  .max(500);

const envName = z
  .string()
  .trim()
  .max(80)
  .regex(/^[A-Z][A-Z0-9_]+$/);

export const gatePartnerPreviewSchema = z.object({
  eventId: uuid,
  provider: z.enum(["hapniin"]),
  apiKeyEnv: envName,
});

export const gatePartnerLinkSchema = z.object({
  eventId: uuid,
  provider: z.enum(["hapniin"]),
  partnerEventId: z.string().trim().min(1).max(200),
  apiKeyEnv: envName,
  webhookSecretEnv: envName.nullable(),
  mapping: z
    .array(
      z.object({
        ticketTypeId: uuid,
        partnerProductId: z.string().trim().min(1).max(200),
      }),
    )
    .min(1)
    .max(50),
  reason,
});
export type GatePartnerLinkInput = z.infer<typeof gatePartnerLinkSchema>;

export const gatePartnerLinkStatusSchema = z.object({
  eventId: uuid,
  status: z.enum(["active", "paused"]),
  reason,
});

export const gatePartnerEndLinkSchema = z.object({
  eventId: uuid,
  reason,
});

export const gatePartnerRecheckSchema = z.object({ eventId: uuid });

export const gatePartnerRetryPushSchema = z.object({
  pushId: uuid,
  reason,
});

export const gatePartnerMarkVoidedSchema = z.object({
  eventId: uuid,
  ticketIds: z.array(uuid).min(1).max(2000),
  reason,
});
