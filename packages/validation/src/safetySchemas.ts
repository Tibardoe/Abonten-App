import { SAFETY_TOKEN_PATTERN } from "@abonten/core/safety/links";
import {
  CHECK_IN_EXTEND_MINUTES,
  CHECK_IN_MAX_MINUTES,
  CHECK_IN_MIN_MINUTES,
  SAFETY_CONTACT_NAME_MAX,
  SAFETY_NOTE_MAX,
  SAFETY_RELATIONSHIPS,
} from "@abonten/core/safety/rules";
import { z } from "zod";

// Abonten Safety inputs: the person's own Safety screen (web Server Actions
// and /api/mobile/safety/**), the contact's page and invite page, and the
// admin console. Lengths mirror the CHECK constraints in
// supabase/migrations/20261021180000_safety_core.sql. Identity is never in
// a payload: the transport proves it.

const uuid = z.string().uuid("Invalid id");

const LOCALES = ["en", "fr", "es", "de", "pt", "ak"] as const;

const note = z
  .string()
  .trim()
  .max(SAFETY_NOTE_MAX, "Keep the note under 280 characters");

export const safetyLocationPointSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  accuracyM: z.number().finite().min(0).max(100_000).nullable().default(null),
  at: z.string().datetime({ offset: true, message: "Invalid time" }),
  source: z.enum(["device", "last_known", "browser"]).default("device"),
});
export type SafetyLocationPointInput = z.infer<
  typeof safetyLocationPointSchema
>;

// ── Trusted contacts ─────────────────────────────────────────────────

const contactName = z
  .string()
  .trim()
  .min(1, "Enter your contact's name")
  .max(SAFETY_CONTACT_NAME_MAX, "Keep the name under 60 characters");

const contactEmail = z
  .string()
  .trim()
  .max(254)
  .email("Enter a valid email address")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

export const addSafetyContactSchema = z.object({
  name: contactName,
  /** The dial code the number was typed with ("+233"). */
  dialCode: z.string().regex(/^\+[0-9]{1,4}$/, "Choose a country code"),
  phone: z.string().trim().min(4, "Enter your contact's phone number").max(32),
  email: contactEmail,
  relationship: z.enum(SAFETY_RELATIONSHIPS).default("other"),
  locale: z.enum(LOCALES).default("en"),
});
export type AddSafetyContactInput = z.infer<typeof addSafetyContactSchema>;

export const updateSafetyContactSchema = z.object({
  contactId: uuid,
  name: contactName.optional(),
  email: contactEmail,
  relationship: z.enum(SAFETY_RELATIONSHIPS).optional(),
  locale: z.enum(LOCALES).optional(),
  /** Moves the contact to the top of the list (who is told first). */
  makeFirst: z.boolean().optional(),
});
export type UpdateSafetyContactInput = z.infer<
  typeof updateSafetyContactSchema
>;

export const safetyContactIdSchema = z.object({ contactId: uuid });

// ── Sessions ─────────────────────────────────────────────────────────

const sessionBase = {
  clientRequestId: uuid,
  location: safetyLocationPointSchema.nullable().optional(),
  eventId: uuid.nullable().optional(),
  note: note.optional(),
};

export const startSafetySessionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sos"), ...sessionBase }),
  z.object({
    kind: z.literal("check_in"),
    ...sessionBase,
    minutes: z
      .number()
      .int()
      .min(CHECK_IN_MIN_MINUTES, "Choose at least 10 minutes")
      .max(CHECK_IN_MAX_MINUTES, "Choose at most 12 hours"),
  }),
  z.object({
    kind: z.literal("share"),
    ...sessionBase,
    hours: z.number().min(0.25).max(24).optional(),
    /** Share until the chosen event ends (needs eventId). */
    untilEventEnds: z.boolean().optional(),
    /** Only these contacts; all of them when absent. */
    contactIds: z
      .array(uuid)
      .min(1, "Choose at least one contact")
      .max(10)
      .optional(),
  }),
]);
export type StartSafetySessionInput = z.infer<typeof startSafetySessionSchema>;

export const recordSafetyLocationSchema = z.object({
  sessionId: uuid,
  points: z.array(safetyLocationPointSchema).min(1).max(20),
});
export type RecordSafetyLocationInput = z.infer<
  typeof recordSafetyLocationSchema
>;

export const updateSafetySessionSchema = z
  .object({
    sessionId: uuid,
    note: note.nullable().optional(),
    extendMinutes: z
      .number()
      .int()
      .refine(
        (m) => (CHECK_IN_EXTEND_MINUTES as readonly number[]).includes(m),
        "Choose 15, 30 or 60 minutes",
      )
      .optional(),
  })
  .refine((v) => v.note !== undefined || v.extendMinutes !== undefined, {
    message: "Nothing to change",
  });
export type UpdateSafetySessionInput = z.infer<
  typeof updateSafetySessionSchema
>;

export const resolveSafetySessionSchema = z.object({
  sessionId: uuid,
  resolution: z.enum(["safe", "false_alarm", "ended"]),
});
export type ResolveSafetySessionInput = z.infer<
  typeof resolveSafetySessionSchema
>;

export const safetySessionIdSchema = z.object({ sessionId: uuid });

// ── The contact's pages ──────────────────────────────────────────────

const token = z.string().regex(SAFETY_TOKEN_PATTERN, "This link is not valid");

export const safetyTokenSchema = z.object({ token });

export const acknowledgeSafetyAlertSchema = z.object({
  token,
  acknowledgement: z.enum(["on_my_way", "calling", "cant_help"]),
});
export type AcknowledgeSafetyAlertInput = z.infer<
  typeof acknowledgeSafetyAlertSchema
>;

export const respondSafetyInviteSchema = z.object({
  token,
  response: z.enum(["accept", "decline", "block_all"]),
});
export type RespondSafetyInviteInput = z.infer<
  typeof respondSafetyInviteSchema
>;

// ── Admin console ────────────────────────────────────────────────────

const reason = z
  .string()
  .trim()
  .min(5, "Give a short reason for this change")
  .max(500);

export const safetySettingsSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  reason,
  patch: z
    .object({
      enabled: z.boolean(),
      audience: z.enum(["staff", "beta", "all"]),
      betaUserIds: z.array(uuid).max(500),
      checkInEnabled: z.boolean(),
      shareEnabled: z.boolean(),
      eventTeamAlertsEnabled: z.boolean(),
      maxContacts: z.number().int().min(1).max(10),
      alertsWithSmsPerDay: z.number().int().min(1).max(50),
      invitesPerDay: z.number().int().min(1).max(50),
      checkInGraceMinutes: z.number().int().min(1).max(30),
      alertHours: z.number().int().min(1).max(72),
      shareMaxHours: z.number().int().min(1).max(24),
      locationRetentionDays: z.number().int().min(1).max(90),
      sessionRetentionDays: z.number().int().min(30).max(730),
    })
    .strict()
    .partial(),
});
export type SafetySettingsInput = z.infer<typeof safetySettingsSchema>;

export const safetyAdminSessionListSchema = z.object({
  kind: z.enum(["sos", "check_in", "share"]).optional(),
  status: z.enum(["active", "alerting", "resolved", "expired"]).optional(),
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type SafetyAdminSessionListInput = z.infer<
  typeof safetyAdminSessionListSchema
>;
