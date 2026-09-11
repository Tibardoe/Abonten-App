import { z } from "zod";

// Zod schemas for every Field Ops mutation (admin console today; the web
// `/field` actions and /api/mobile/field-ops routes reuse them later). Ids
// only ever select a row; identity, role, amounts and status come from the
// server.

const reason = z
  .string()
  .trim()
  .min(3, "Give a short reason (at least 3 characters)")
  .max(1000);

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

export const latLngSchema = z.object({ lat: latitude, lng: longitude });

export const geoJsonPolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z
    .array(
      z
        .array(z.tuple([longitude, latitude]))
        .min(4)
        .max(2000),
    )
    .min(1)
    .max(1),
});

export const fieldOpsCampaignStatusSchema = z.enum([
  "draft",
  "active",
  "paused",
  "winding_down",
  "completed",
  "archived",
]);

export const fieldOpsCampaignActionSchema = z.enum([
  "activate",
  "pause",
  "resume",
  "wind_down",
  "complete",
  "archive",
]);

export const fieldOpsMemberRoleSchema = z.enum([
  "team_lead",
  "content_creator",
  "offline_member",
  "online_member",
]);

export const fieldOpsActivityKeySchema = z.enum([
  "place_onboarding_offline",
  "place_onboarding_online",
  "event_onboarding_offline",
  "event_onboarding_online",
  "existing_place_claim_assist",
  "content_deliverable",
  "content_monthly_stipend",
  "team_lead_monthly_stipend",
]);

const currency = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. GHS");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const e164 = z
  .string()
  .trim()
  .regex(
    /^\+[1-9][0-9]{6,14}$/,
    "Use the international format, e.g. +233241234567",
  );

// ── Programme settings ──────────────────────────────────────

export const fieldOpsSettingsSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  reason,
  patch: z
    .object({
      programEnabled: z.boolean(),
      workerUiEnabled: z.boolean(),
      commissionGenerationEnabled: z.boolean(),
      payoutsEnabled: z.boolean(),
      requireMemberPhoneVerified: z.boolean(),
      defaultHoldingDays: z.number().int().min(0).max(90),
      duplicateRadiusM: z.number().int().min(10).max(5000),
      duplicateNameSimilarity: z.number().min(0).max(1),
      offlineMaxDistanceM: z.number().int().min(10).max(5000),
      dailySubmissionCap: z.number().int().min(1).max(200),
      spotCheckBps: z.number().int().min(0).max(10000),
      reviewGraceDays: z.number().int().min(0).max(90),
      evidenceRetentionDays: z.number().int().min(30).max(3650),
      notifyPushEnabled: z.boolean(),
    })
    .strict()
    .partial(),
});

// ── Regions & territories ───────────────────────────────────

export const fieldOpsRegionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a 2-letter country code, e.g. GH"),
  adminCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/, "Use an ISO 3166-2 code, e.g. GH-AH")
    .nullable()
    .optional(),
  centre: latLngSchema.nullable().optional(),
  status: z.enum(["active", "retired"]).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const fieldOpsTerritorySchema = z.object({
  id: z.string().uuid().optional(),
  regionId: z.string().uuid(),
  parentTerritoryId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(80),
  kind: z.enum(["town", "area"]),
  centre: latLngSchema,
  radiusM: z.number().int().min(100).max(50000),
  boundary: geoJsonPolygonSchema.nullable().optional(),
  status: z.enum(["active", "completed", "retired"]).optional(),
  priority: z.number().int().min(-100).max(100).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const fieldOpsGeocodeSchema = z.object({
  query: z.string().trim().min(2).max(200),
});

// ── Campaigns ───────────────────────────────────────────────

export const fieldOpsCampaignSchema = z.object({
  id: z.string().uuid().optional(),
  regionId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  currency,
  startsOn: isoDate.nullable().optional(),
  endsOn: isoDate.nullable().optional(),
  budgetCapMinor: z
    .number()
    .int()
    .min(0)
    .max(1_000_000_000)
    .nullable()
    .optional(),
  holdingDaysOverride: z.number().int().min(0).max(90).nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
});

export const fieldOpsCampaignStatusChangeSchema = z.object({
  campaignId: z.string().uuid(),
  action: fieldOpsCampaignActionSchema,
  reason,
});

// ── Team & members ──────────────────────────────────────────

export const fieldOpsAddMemberSchema = z
  .object({
    campaignId: z.string().uuid(),
    role: fieldOpsMemberRoleSchema,
    // Exactly one of: an existing user, or a phone to invite.
    userId: z.string().uuid().nullable().optional(),
    invitedPhoneE164: e164.nullable().optional(),
    fullName: z.string().trim().max(120).nullable().optional(),
  })
  .refine((v) => Boolean(v.userId) !== Boolean(v.invitedPhoneE164), {
    message:
      "Pick an existing user or enter a phone number to invite, not both",
  });

export const fieldOpsMemberStatusSchema = z.object({
  memberId: z.string().uuid(),
  status: z.enum(["active", "suspended", "left"]),
  reason,
});

export const fieldOpsMemberRoleChangeSchema = z.object({
  memberId: z.string().uuid(),
  role: fieldOpsMemberRoleSchema,
  reason,
});

// ── Commission rules ────────────────────────────────────────

export const fieldOpsEligibilitySchema = z
  .object({
    holding_days: z.number().int().min(0).max(90),
    min_photos: z.number().int().min(0).max(20),
    require_owner_phone_verified: z.boolean(),
    require_inside_territory: z.boolean(),
    max_distance_m: z.number().int().min(10).max(5000),
    min_description_chars: z.number().int().min(0).max(2000),
    require_opening_hours: z.boolean(),
    require_contact: z.boolean(),
    min_days_before_start: z.number().int().min(0).max(365),
    release_policy: z.enum([
      "holding_period",
      "event_started",
      "claim_approved",
    ]),
  })
  .strict()
  .partial();

export const fieldOpsRuleVersionSchema = z.object({
  campaignId: z.string().uuid().nullable(),
  activityKey: fieldOpsActivityKeySchema,
  amountMinor: z.number().int().min(0).max(100_000_000),
  currency,
  eligibility: fieldOpsEligibilitySchema,
  note: z.string().trim().min(3, "Describe the change").max(500),
  reason,
});

export const fieldOpsRuleActivationSchema = z.object({
  campaignId: z.string().uuid().nullable(),
  activityKey: fieldOpsActivityKeySchema,
  ruleId: z.string().uuid().nullable(),
  reason,
});

export type FieldOpsSettingsInput = z.infer<typeof fieldOpsSettingsSchema>;
export type FieldOpsRegionInput = z.infer<typeof fieldOpsRegionSchema>;
export type FieldOpsTerritoryInput = z.infer<typeof fieldOpsTerritorySchema>;
export type FieldOpsCampaignInput = z.infer<typeof fieldOpsCampaignSchema>;
export type FieldOpsAddMemberInput = z.infer<typeof fieldOpsAddMemberSchema>;
export type FieldOpsRuleVersionInput = z.infer<
  typeof fieldOpsRuleVersionSchema
>;
