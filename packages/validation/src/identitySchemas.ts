import { z } from "zod";

// Identity verification inputs: the person's own identity page (web Server
// Actions and /api/mobile/identity/**) and the admin console. Who is asking
// is never in a payload: the transport proves it. Codes mirror the CHECK
// constraints in supabase/migrations/20261023100000_identity_verification.sql.

const uuid = z.string().uuid("Invalid id");

const LOCALES = ["en", "fr", "es", "de", "pt", "ak"] as const;

export const startIdentityVerificationSchema = z.object({
  documentCountry: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Choose the country that issued your document"),
  documentType: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]{2,40}$/, "Choose a document"),
  consent: z.literal(true, {
    errorMap: () => ({
      message: "Agree to the identity check before you start",
    }),
  }),
  locale: z.enum(LOCALES).optional(),
});
export type StartIdentityVerificationInput = z.infer<
  typeof startIdentityVerificationSchema
>;

export const identityVerificationIdSchema = z.object({
  verificationId: uuid,
});
export type IdentityVerificationIdInput = z.infer<
  typeof identityVerificationIdSchema
>;

/** Only outside production: the stand-in provider's outcome picker. */
export const completeTestIdentitySchema = z.object({
  verificationId: uuid,
  outcome: z.enum(["clear", "attention", "block", "error", "underage"]),
});
export type CompleteTestIdentityInput = z.infer<
  typeof completeTestIdentitySchema
>;

// ── Admin ───────────────────────────────────────────────────────────

const reason = z
  .string()
  .trim()
  .min(5, "Give a short reason for this change")
  .max(500);

export const identitySettingsSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  reason,
  patch: z
    .object({
      enabled: z.boolean(),
      audience: z.enum(["staff", "beta", "all"]),
      betaUserIds: z.array(uuid).max(500),
      requireForPayouts: z.boolean(),
      requireForPlaceClaims: z.boolean(),
      requireForVerifiedBadges: z.boolean(),
      requireForPaidEvents: z.boolean(),
      autoApproveClear: z.boolean(),
      attemptsPerDay: z.number().int().min(1).max(20),
      attemptsPer30Days: z.number().int().min(1).max(60),
      minimumAge: z.number().int().min(13).max(25),
      validityMonths: z.number().int().min(6).max(120),
      linkExpiryHours: z.number().int().min(1).max(168),
      retentionDaysUnsuccessful: z.number().int().min(30).max(3650),
      retentionDaysAfterDeletion: z.number().int().min(30).max(3650),
      retentionDaysFraud: z.number().int().min(365).max(3650),
    })
    .strict()
    .partial(),
});
export type IdentitySettingsInput = z.infer<typeof identitySettingsSchema>;

export const identityAdminListSchema = z.object({
  status: z
    .enum([
      "created",
      "submitted",
      "processing",
      "approved",
      "needs_review",
      "rejected",
      "failed",
      "expired",
      "cancelled",
      "revoked",
    ])
    .optional(),
  userId: uuid.optional(),
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type IdentityAdminListInput = z.infer<typeof identityAdminListSchema>;

export const identityAdminDecisionSchema = z.object({
  verificationId: uuid,
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500).optional(),
});
export type IdentityAdminDecisionInput = z.infer<
  typeof identityAdminDecisionSchema
>;

export const identityAdminRevokeSchema = z.object({
  verificationId: uuid,
  reason,
});
export type IdentityAdminRevokeInput = z.infer<
  typeof identityAdminRevokeSchema
>;

/** Showing someone's document details: a reason is kept in the audit log. */
export const identityAdminRevealSchema = z.object({
  verificationId: uuid,
  reason,
});
export type IdentityAdminRevealInput = z.infer<
  typeof identityAdminRevealSchema
>;
