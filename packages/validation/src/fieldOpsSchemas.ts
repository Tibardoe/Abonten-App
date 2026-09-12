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

// ── Phase 1: field shell (members + team leads) ─────────────
// Every schema below carries the campaignId the caller says they are acting
// in; the service checks that the caller really holds the needed role there.

const uuid = z.string().uuid();

export const fieldOpsAssignmentCreateSchema = z
  .object({
    campaignId: uuid,
    memberId: uuid,
    territoryId: uuid,
    startsOn: isoDate,
    endsOn: isoDate,
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => v.endsOn >= v.startsOn, {
    message: "The end date can't be before the start date",
    path: ["endsOn"],
  });

export const fieldOpsAssignmentCancelSchema = z.object({
  campaignId: uuid,
  assignmentId: uuid,
  reason,
});

export const fieldOpsAssignmentStartSchema = z.object({
  campaignId: uuid,
  assignmentId: uuid,
  location: latLngSchema.nullable().optional(),
  accuracyM: z.number().min(0).max(100000).nullable().optional(),
});

export const fieldOpsAssignmentCompleteSchema = z.object({
  campaignId: uuid,
  assignmentId: uuid,
});

export const fieldOpsAssignmentListSchema = z.object({
  campaignId: uuid,
  /** YYYY-MM-DD; assignments covering that day. */
  date: isoDate.optional(),
  status: z.enum(["assigned", "started", "completed", "cancelled"]).optional(),
});

export const fieldOpsProspectKindSchema = z.enum([
  "place",
  "event",
  "organizer",
]);
export const fieldOpsContactChannelSchema = z.enum([
  "in_person",
  "phone",
  "whatsapp",
  "social",
  "email",
]);
export const fieldOpsContactOutcomeSchema = z.enum([
  "no_answer",
  "call_back",
  "interested",
  "declined",
  "other",
]);

export const fieldOpsProspectCreateSchema = z.object({
  campaignId: uuid,
  territoryId: uuid,
  kind: fieldOpsProspectKindSchema,
  name: z.string().trim().min(2).max(120),
  contactName: z.string().trim().max(120).nullable().optional(),
  contactPhoneE164: e164.nullable().optional(),
  contactChannel: fieldOpsContactChannelSchema.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const fieldOpsProspectUpdateSchema = z
  .object({
    campaignId: uuid,
    prospectId: uuid,
    status: z
      .enum(["identified", "contacted", "interested", "declined"])
      .optional(),
    contactAttempt: z
      .object({
        channel: fieldOpsContactChannelSchema,
        outcome: fieldOpsContactOutcomeSchema,
        note: z.string().trim().max(500).nullable().optional(),
      })
      .optional(),
    contactName: z.string().trim().max(120).nullable().optional(),
    contactPhoneE164: e164.nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.contactAttempt !== undefined ||
      v.contactName !== undefined ||
      v.contactPhoneE164 !== undefined ||
      v.notes !== undefined,
    { message: "Nothing to change" },
  );

export const fieldOpsTerritoryLookupSchema = z.object({
  campaignId: uuid,
  territoryId: uuid,
});

/** A lead adds or edits a town/area in their campaign's region. */
export const fieldOpsLeadTerritorySchema = fieldOpsTerritorySchema
  .omit({ regionId: true, status: true })
  .extend({ campaignId: uuid });

export const fieldOpsLeadTerritoryStatusSchema = z.object({
  campaignId: uuid,
  territoryId: uuid,
  status: z.enum(["active", "completed"]),
});

/** A lead invites a field member by phone (never another lead). */
export const fieldOpsLeadInviteSchema = z.object({
  campaignId: uuid,
  role: z.enum(["content_creator", "offline_member", "online_member"]),
  invitedPhoneE164: e164,
  fullName: z.string().trim().min(2).max(120),
});

export const fieldOpsLeadMemberStatusSchema = z.object({
  campaignId: uuid,
  memberId: uuid,
  status: z.enum(["active", "suspended", "left"]),
  reason,
});

export const fieldOpsAnnouncementSchema = z.object({
  campaignId: uuid,
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(1000),
});

export const fieldOpsCampaignIdSchema = z.object({ campaignId: uuid });

// ── Phase 2: onboarding wizard + lead review ────────────────

const onboardingRef = z.object({ campaignId: uuid, onboardingId: uuid });

export const fieldOpsOnboardingStartSchema = z.object({
  campaignId: uuid,
  territoryId: uuid,
  prospectId: uuid.nullable().optional(),
  /** Reused on retry so a double tap never opens two onboardings. */
  clientRequestId: uuid.optional(),
});

export const fieldOpsSimilarSearchSchema = z.object({
  campaignId: uuid,
  onboardingId: uuid,
  name: z.string().trim().min(2).max(150),
  location: latLngSchema,
  phoneE164: e164.nullable().optional(),
  whatsappE164: e164.nullable().optional(),
});

export const fieldOpsOwnerOtpRequestSchema = z.object({
  campaignId: uuid,
  onboardingId: uuid,
  ownerFullName: z.string().trim().min(2).max(120),
  ownerPhoneE164: e164,
});

export const fieldOpsOwnerOtpVerifySchema = z.object({
  campaignId: uuid,
  onboardingId: uuid,
  code: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "Enter the code we sent"),
});

/** The public consent page: the token identifies the onboarding. */
export const fieldOpsConsentVerifySchema = z.object({
  token: z.string().min(20).max(600),
  code: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "Enter the code we sent"),
});

export const fieldOpsEvidenceKindSchema = z.enum([
  "storefront",
  "interior",
  "owner_consent",
  "other",
]);

export const fieldOpsEvidenceRequestSchema = z.object({
  campaignId: uuid,
  onboardingId: uuid,
  kind: fieldOpsEvidenceKindSchema,
  mimeType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ]),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
  capturedAt: z.string().datetime().nullable().optional(),
  location: latLngSchema.nullable().optional(),
  accuracyM: z.number().min(0).max(100000).nullable().optional(),
});

export const fieldOpsEvidenceRemoveSchema = z.object({
  campaignId: uuid,
  onboardingId: uuid,
  evidenceId: uuid,
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const fieldOpsOpeningHoursSchema = z
  .array(
    z
      .object({
        dayOfWeek: z.number().int().min(0).max(6),
        openTime: hhmm.nullable(),
        closeTime: hhmm.nullable(),
        isClosed: z.boolean(),
      })
      .refine((h) => h.isClosed || (h.openTime && h.closeTime), {
        message: "Give opening and closing times, or mark the day closed",
      }),
  )
  .max(7);

const cloudinaryId = z
  .string()
  .trim()
  .min(3)
  .max(200)
  .regex(/^[a-z0-9_/-]+$/i, "Invalid photo reference");

export const fieldOpsPlaceDetailsSchema = z.object({
  name: z.string().trim().min(2).max(150),
  categoryId: z.number().int().min(1),
  description: z.string().trim().min(20).max(2000),
  address: z.string().trim().min(3).max(300),
  location: latLngSchema,
  websiteUrl: z.string().trim().url().max(300).nullable().optional(),
  phoneE164: e164.nullable().optional(),
  whatsappE164: e164.nullable().optional(),
  openingHours: fieldOpsOpeningHoursSchema.optional(),
  cover: z.object({ publicId: cloudinaryId, version: z.string().min(1) }),
  photos: z
    .array(z.object({ publicId: cloudinaryId, version: z.string().min(1) }))
    .max(10)
    .optional(),
});

export const fieldOpsOnboardingSubmitSchema = z.object({
  campaignId: uuid,
  onboardingId: uuid,
  place: fieldOpsPlaceDetailsSchema,
  /** Offline mode: where the member is right now. */
  submissionLocation: latLngSchema.nullable().optional(),
  submissionAccuracyM: z.number().min(0).max(100000).nullable().optional(),
  /** The member looked at the similar listings and says it's none of them. */
  duplicateAcknowledged: z.boolean().optional(),
});

export const fieldOpsOnboardingWithdrawSchema = onboardingRef.extend({
  reason: z.string().trim().max(1000).nullable().optional(),
});

export const fieldOpsOnboardingRefSchema = onboardingRef;

export const fieldOpsOnboardingListSchema = z.object({
  campaignId: uuid,
  status: z
    .enum([
      "draft",
      "submitted",
      "needs_changes",
      "verified",
      "flagged",
      "succeeded",
      "rejected",
      "withdrawn",
    ])
    .optional(),
});

export const fieldOpsReviewSchema = z
  .object({
    campaignId: uuid,
    onboardingId: uuid,
    decision: z.enum(["verified", "needs_changes", "rejected"]),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => v.decision === "verified" || (v.note && v.note.length >= 3), {
    message: "Tell the member what to change, or why it was rejected",
    path: ["note"],
  });

/** Admin override of a lead's decision (fieldops.verify). */
export const fieldOpsAdminOnboardingDecisionSchema = z.object({
  onboardingId: uuid,
  decision: z.enum(["verified", "needs_changes", "rejected"]),
  note: z.string().trim().min(3).max(2000),
  reason,
});

export const fieldOpsAdminOnboardingListSchema = z.object({
  campaignId: uuid.optional(),
  status: fieldOpsOnboardingListSchema.shape.status.optional(),
  cursor: z.string().optional(),
});

// ── Phase 3: commissions and the flag queue ─────────────────

const commissionStatus = z.enum([
  "pending",
  "approved",
  "in_payout",
  "paid",
  "rejected",
  "reversed",
]);

/** A member's own earnings page. */
export const fieldOpsEarningsSchema = z.object({
  campaignId: uuid.optional(),
});

/** Admin ledger browse (fieldops.view). */
export const fieldOpsAdminCommissionListSchema = z.object({
  campaignId: uuid.optional(),
  memberId: uuid.optional(),
  status: commissionStatus.optional(),
  cursor: z.string().optional(),
});

/** Admin takes a commission back (fieldops.commissions.approve + step-up). */
export const fieldOpsAdminCommissionReverseSchema = z.object({
  commissionId: uuid,
  reason,
});

/** Admin resolves a flag the sweep raised (fieldops.verify). */
export const fieldOpsAdminFlagDecisionSchema = z
  .object({
    onboardingId: uuid,
    decision: z.enum(["succeeded", "rejected"]),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => v.decision === "succeeded" || (v.note && v.note.length >= 3), {
    message: "Say why it was rejected",
    path: ["note"],
  });

export const fieldOpsAdminFlagQueueSchema = z.object({
  campaignId: uuid.optional(),
  cursor: z.string().optional(),
});

export type FieldOpsEarningsInput = z.infer<typeof fieldOpsEarningsSchema>;
export type FieldOpsAdminCommissionListInput = z.infer<
  typeof fieldOpsAdminCommissionListSchema
>;
export type FieldOpsAdminCommissionReverseInput = z.infer<
  typeof fieldOpsAdminCommissionReverseSchema
>;
export type FieldOpsAdminFlagDecisionInput = z.infer<
  typeof fieldOpsAdminFlagDecisionSchema
>;
export type FieldOpsAdminFlagQueueInput = z.infer<
  typeof fieldOpsAdminFlagQueueSchema
>;

// -- Phase 4: payouts ----------------------------------------

/** Ghana MoMo networks; kept as a closed list so the CSV stays uploadable. */
const momoNetwork = z.enum(["MTN", "Telecel", "AirtelTigo"]);

/** A member sets where their own earnings go. */
export const fieldOpsPayoutDestinationSchema = z.object({
  campaignId: uuid,
  momoNumber: z
    .string()
    .trim()
    .regex(/^0[235][0-9]{8}$/, "Enter a 10-digit Ghana mobile money number"),
  momoNetwork,
  holderName: z
    .string()
    .trim()
    .min(2, "Enter the name on the mobile money account")
    .max(120),
});

export const fieldOpsPayoutBatchListSchema = z.object({
  campaignId: uuid.optional(),
  status: z.enum(["draft", "approved", "paid", "cancelled"]).optional(),
});

export const fieldOpsPayoutBatchBuildSchema = z.object({
  campaignId: uuid,
  label: z.string().trim().min(2, "Name the batch, e.g. Week 37").max(80),
  reason,
});

export const fieldOpsPayoutBatchRefSchema = z.object({
  batchId: uuid,
  reason,
});

export const fieldOpsPayoutItemMarkSchema = z
  .object({
    itemId: uuid,
    status: z.enum(["paid", "failed"]),
    reference: z.string().trim().max(200).nullable().optional(),
    failureReason: z.string().trim().max(2000).nullable().optional(),
  })
  .refine(
    (v) =>
      v.status === "failed"
        ? Boolean(v.failureReason && v.failureReason.length >= 3)
        : Boolean(v.reference && v.reference.length >= 3),
    {
      message: "Record the transfer reference, or say why the transfer failed",
      path: ["reference"],
    },
  );

export type FieldOpsPayoutDestinationInput = z.infer<
  typeof fieldOpsPayoutDestinationSchema
>;
export type FieldOpsPayoutBatchListInput = z.infer<
  typeof fieldOpsPayoutBatchListSchema
>;
export type FieldOpsPayoutBatchBuildInput = z.infer<
  typeof fieldOpsPayoutBatchBuildSchema
>;
export type FieldOpsPayoutBatchRefInput = z.infer<
  typeof fieldOpsPayoutBatchRefSchema
>;
export type FieldOpsPayoutItemMarkInput = z.infer<
  typeof fieldOpsPayoutItemMarkSchema
>;

export type FieldOpsPlaceDetailsInput = z.infer<
  typeof fieldOpsPlaceDetailsSchema
>;
export type FieldOpsOnboardingSubmitInput = z.infer<
  typeof fieldOpsOnboardingSubmitSchema
>;
export type FieldOpsEvidenceRequestInput = z.infer<
  typeof fieldOpsEvidenceRequestSchema
>;
export type FieldOpsReviewInput = z.infer<typeof fieldOpsReviewSchema>;

export type FieldOpsAssignmentCreateInput = z.infer<
  typeof fieldOpsAssignmentCreateSchema
>;
export type FieldOpsAssignmentStartInput = z.infer<
  typeof fieldOpsAssignmentStartSchema
>;
export type FieldOpsAssignmentListInput = z.infer<
  typeof fieldOpsAssignmentListSchema
>;
export type FieldOpsProspectCreateInput = z.infer<
  typeof fieldOpsProspectCreateSchema
>;
export type FieldOpsProspectUpdateInput = z.infer<
  typeof fieldOpsProspectUpdateSchema
>;
export type FieldOpsLeadTerritoryInput = z.infer<
  typeof fieldOpsLeadTerritorySchema
>;
export type FieldOpsLeadInviteInput = z.infer<typeof fieldOpsLeadInviteSchema>;
export type FieldOpsAnnouncementInput = z.infer<
  typeof fieldOpsAnnouncementSchema
>;

export type FieldOpsSettingsInput = z.infer<typeof fieldOpsSettingsSchema>;
export type FieldOpsRegionInput = z.infer<typeof fieldOpsRegionSchema>;
export type FieldOpsTerritoryInput = z.infer<typeof fieldOpsTerritorySchema>;
export type FieldOpsCampaignInput = z.infer<typeof fieldOpsCampaignSchema>;
export type FieldOpsAddMemberInput = z.infer<typeof fieldOpsAddMemberSchema>;
export type FieldOpsRuleVersionInput = z.infer<
  typeof fieldOpsRuleVersionSchema
>;
