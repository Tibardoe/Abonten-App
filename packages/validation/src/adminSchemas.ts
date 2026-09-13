import { z } from "zod";

// Zod schemas for admin-console mutations. Each admin Server Action / route
// handler validates its input with one of these before calling the matching
// @abonten/services/admin function. Kept small and explicit — one schema
// per action.

export const reportAssignSchema = z.object({
  reportId: z.string().uuid(),
  assigneeId: z.string().uuid().nullable(), // null = unassign
  // optimistic concurrency: the status the client last saw
  expectedUpdatedAt: z.string().datetime().optional(),
});

export const reportStatusSchema = z.object({
  reportId: z.string().uuid(),
  status: z.enum(["new", "under_review", "awaiting_info", "escalated"]),
  expectedUpdatedAt: z.string().datetime().optional(),
});

export const reportResolveSchema = z.object({
  reportId: z.string().uuid(),
  status: z.enum(["resolved", "dismissed", "false_report"]),
  resolution: z
    .string()
    .trim()
    .min(1, "A resolution note is required")
    .max(2000),
  resolutionAction: z.string().trim().max(120).optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});

export const resolveReportGroupSchema = z.object({
  dedupeKey: z.string().min(3).max(120),
  status: z.enum(["resolved", "dismissed", "false_report"]),
  resolution: z
    .string()
    .trim()
    .min(1, "A resolution note is required")
    .max(2000),
  resolutionAction: z.string().trim().max(120).optional(),
  moderation: z
    .object({
      action: z.enum([
        "hide",
        "unhide",
        "remove",
        "restore",
        "restrict",
        "unrestrict",
      ]),
      reason: z.string().trim().min(1).max(2000),
    })
    .optional(),
});

export const reportRequestInfoSchema = z.object({
  reportId: z.string().uuid(),
  message: z.string().trim().min(1).max(1000),
  expectedUpdatedAt: z.string().datetime().optional(),
});

export const reportEscalateSchema = z.object({
  reportId: z.string().uuid(),
  note: z.string().trim().max(1000).optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});

export const adminNoteSchema = z.object({
  targetType: z.string().min(1).max(40),
  targetId: z.string().min(1).max(64),
  body: z.string().trim().min(1, "Note can't be empty").max(4000),
});

export const moderationActionSchema = z.object({
  targetType: z.enum([
    "event",
    "place",
    "event_review",
    "place_review",
    "user_review",
    "highlight",
    "message",
    "conversation",
  ]),
  targetId: z.string().uuid(),
  action: z.enum([
    "hide",
    "unhide",
    "remove",
    "restore",
    "restrict",
    "unrestrict",
  ]),
  reason: z.string().trim().min(1, "A reason is required").max(2000),
  reportId: z.string().uuid().nullable().optional(),
});

// Moderator-only removal of the organizer/owner *reply* on a review (the
// review itself is untouched — use moderationActionSchema for that).
export const clearReviewResponseSchema = z.object({
  targetType: z.enum(["event_review", "place_review"]),
  reviewId: z.string().uuid(),
  reason: z.string().trim().max(2000).optional(),
  reportId: z.string().uuid().nullable().optional(),
});

export const setUserStatusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["Active", "Suspended", "Banned"]),
  reason: z.string().trim().min(1, "A reason is required").max(2000),
  reportId: z.string().uuid().nullable().optional(),
  // client's last-seen status_id, for optimistic concurrency
  expectedStatus: z.enum(["Active", "Suspended", "Banned"]).optional(),
});

export const grantAdminRoleSchema = z.object({
  targetUserId: z.string().uuid(),
  roleKey: z.enum([
    "super_admin",
    "operations",
    "moderator",
    "finance_admin",
    "support_admin",
    "analyst",
  ]),
});

export const revokeAdminRoleSchema = grantAdminRoleSchema;

export const setAdminUserStatusSchema = z.object({
  targetUserId: z.string().uuid(),
  status: z.enum(["active", "disabled"]),
});

export const setRolePermissionSchema = z.object({
  roleKey: z.enum([
    "super_admin",
    "operations",
    "moderator",
    "finance_admin",
    "support_admin",
    "analyst",
  ]),
  permissionKey: z.string().trim().min(1).max(64),
  enabled: z.boolean(),
});

export const reviewClaimSchema = z.object({
  claimId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(2000).optional(),
  // optimistic concurrency: the status the client last saw ("pending")
  expectedStatus: z.enum(["pending", "approved", "rejected"]).optional(),
  // "Approve and verify": the reviewer judged the claim's documents good
  // enough to also verify the place. Needs verification.review on top of
  // claims.review; runs as one transaction (approve_place_claim_and_verify).
  alsoVerify: z.boolean().optional(),
});

// ─────────────────────────────────────────────────────────────
// Trust & Verification (PROJECT.md §30)
// ─────────────────────────────────────────────────────────────

export const decideVerificationSchema = z
  .object({
    caseId: z.string().uuid(),
    decision: z.enum(["approve", "reject", "request_info"]),
    // Shown to the requester verbatim, so it must say something useful.
    reason: z.string().trim().max(2000).optional(),
    expectedStatus: z
      .enum([
        "draft",
        "pending_review",
        "needs_info",
        "approved",
        "rejected",
        "withdrawn",
        "revoked",
      ])
      .optional(),
  })
  .refine(
    (v) => v.decision === "approve" || (v.reason?.trim().length ?? 0) > 0,
    {
      message: "A reason is required — the applicant is shown it",
      path: ["reason"],
    },
  );

export const revokeVerificationSchema = z.object({
  caseId: z.string().uuid(),
  reason: z.string().trim().min(1, "A reason is required").max(2000),
});

export const verificationNoteSchema = z.object({
  caseId: z.string().uuid(),
  body: z.string().trim().min(1, "Write a note").max(4000),
});

export const adminRefundSchema = z.object({
  transactionId: z.string().uuid(),
  reason: z.string().trim().min(1, "A reason is required").max(2000),
});

export const settlePayoutSchema = z.object({
  payoutId: z.string().uuid(),
  status: z.enum(["completed", "failed", "cancelled"]),
  failureReason: z.string().trim().max(500).optional(),
  reason: z.string().trim().min(1, "A reason is required").max(2000),
});

export const createPayoutSchema = z.object({
  organizerId: z.string().uuid(),
  payoutAccountId: z.string().uuid(),
  amount: z.number().positive("Enter an amount greater than zero"),
  currency: z.string().trim().length(3),
  reason: z.string().trim().min(1, "A reason is required").max(2000),
});

export const sendPayoutSchema = z.object({
  payoutId: z.string().uuid(),
  reason: z.string().trim().min(1, "A reason is required").max(2000),
});

export const clearPayoutReviewSchema = z.object({
  payoutId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(10, "Say what you checked (at least 10 characters)")
    .max(2000),
});

export const resendNotificationSchema = z.object({
  id: z.string().uuid(),
});

export const broadcastNotificationSchema = z.object({
  segment: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("all_users") }),
    z.object({
      kind: z.literal("event_attendees"),
      eventId: z.string().uuid(),
    }),
    z.object({ kind: z.literal("single_user"), userId: z.string().uuid() }),
  ]),
  type: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1, "A title is required").max(160),
  body: z.string().trim().max(1000).optional(),
  link: z.string().trim().max(400).optional(),
});

export const errorGroupStatusSchema = z.object({
  fingerprint: z.string().min(1).max(200),
  status: z.enum(["open", "acknowledged", "resolved", "ignored"]),
});

export const incidentUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  component: z.string().trim().max(80).nullable().optional(),
  summary: z.string().trim().max(4000).nullable().optional(),
});

export const dashboardRangeSchema = z.object({
  range: z.enum(["today", "yesterday", "7d", "30d", "90d", "custom"]),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// ── In-app support queue ────────────────────────────────────

export const supportAssignSchema = z.object({
  conversationId: z.string().uuid(),
  // null = unassign; omitted-as-null handled by the caller
  assigneeId: z.string().uuid().nullable(),
});

export const supportReplySchema = z.object({
  conversationId: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(1, "A reply is required")
    .max(4000, "That reply is too long"),
});

export const supportStatusSchema = z.object({
  conversationId: z.string().uuid(),
  status: z.enum(["open", "closed"]),
});

// ── Rewards (Abonten Credit) ────────────────────────────────
// Amounts are entered in cedis and converted to pesewas by the action.

const creditReason = z
  .string()
  .trim()
  .min(3, "Give a reason (at least 3 characters)")
  .max(1000, "Keep the reason under 1000 characters");

export const creditAdjustmentSchema = z.object({
  userId: z.string().uuid(),
  direction: z.enum(["credit", "debit"]),
  amount: z
    .number()
    .positive("Enter an amount greater than zero")
    .max(100000, "That amount is too large for a manual adjustment"),
  reason: creditReason,
  userLabel: z.string().trim().max(120).optional(),
  spendScope: z.enum(["any", "tickets", "promotions"]).default("any"),
  expiresInDays: z.number().int().positive().max(730).optional(),
  allowNegative: z.boolean().default(false),
});

export const creditAdjustmentDecisionSchema = z
  .object({
    requestId: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.decision === "approve" || (v.note?.length ?? 0) >= 3, {
    message: "Say why you are rejecting it",
    path: ["note"],
  });

export const goodwillCreditSchema = z.object({
  userId: z.string().uuid(),
  amount: z
    .number()
    .positive("Enter an amount greater than zero")
    .max(1000, "Goodwill credit is for small amounts"),
  reason: creditReason,
  // Generated once per form open, so a double-submit can't grant twice.
  requestId: z.string().uuid(),
});

export const creditAccountStatusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "frozen"]),
  reason: creditReason,
});

export const referralCodeDisabledSchema = z.object({
  userId: z.string().uuid(),
  disabled: z.boolean(),
  reason: creditReason,
});

// Withdrawal settings are deliberately NOT editable: cash withdrawal is out
// of scope for version 1 (owner decision 2026-09-10) and there is no
// withdrawal code for the switch to turn on.
export const rewardsSettingsSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  reason: creditReason,
  patch: z
    .object({
      rewardsEnabled: z.boolean(),
      audience: z.enum(["staff", "beta", "all"]),
      betaUserIds: z.array(z.string().uuid()).max(500),
      referralCaptureEnabled: z.boolean(),
      shadowMode: z.boolean(),
      redeemPromotionsEnabled: z.boolean(),
      redeemTicketsEnabled: z.boolean(),
      allowFullCreditTicketOrders: z.boolean(),
      maxCreditShareOfTicketOrderBps: z.number().int().min(0).max(10000),
      minCashChargeMinor: z.number().int().min(0).max(100000),
      budgetFloorMinor: z.number().int().min(0).max(100000000),
      budgetNetRevenueShareBps: z.number().int().min(0).max(10000),
      dualApprovalThresholdMinor: z.number().int().min(0).max(10000000),
      supportGoodwillMonthlyCapMinor: z.number().int().min(0).max(1000000),
      creditSharePayoutHoldBps: z.number().int().min(0).max(10000),
      referralAttributionWindowDays: z.number().int().min(1).max(90),
      notifyPushEnabled: z.boolean(),
      notifyEmailEnabled: z.boolean(),
    })
    .strict()
    .partial(),
});

// Discovery programme (search, recommendation notifications, prompts).
export const discoverySettingsSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(5, "Give a short reason for this change")
    .max(500),
  resetWatermark: z.boolean().optional(),
  patch: z
    .object({
      searchV2Enabled: z.boolean(),
      searchAudience: z.enum(["staff", "beta", "all"]),
      organizerSearchEnabled: z.boolean(),
      placeSearchEnabled: z.boolean(),
      searchLoggingEnabled: z.boolean(),
      searchLogRetentionDays: z.number().int().min(7).max(730),
      recommendationsEnabled: z.boolean(),
      recommendationsShadowMode: z.boolean(),
      recommendationsAudience: z.enum(["staff", "beta", "all"]),
      promptsEnabled: z.boolean(),
      betaUserIds: z.array(z.string().uuid()).max(500),
      dailyPushCap: z.number().int().min(0).max(5),
      weeklyPushCap: z.number().int().min(0).max(14),
      organizerCooldownHours: z.number().int().min(0).max(720),
      similarDefaultRadiusKm: z.number().min(1).max(200),
      candidateTtlDays: z.number().int().min(1).max(30),
      ignorePauseAfter: z.number().int().min(1).max(20),
      ignorePauseDays: z.number().int().min(1).max(90),
      digestHourLocal: z.number().int().min(8).max(20),
      promptCooldownDays: z.number().int().min(0).max(90),
      promptDismissDays: z.number().int().min(1).max(365),
      promptMaxShows: z.number().int().min(1).max(20),
      recommendationRetentionDays: z.number().int().min(7).max(730),
    })
    .strict()
    .partial(),
});

// Held rewards (risk review). The note is audited and stored on the reward.
export const rewardReviewSchema = z.object({
  rewardEventId: z.string().uuid(),
  approve: z.boolean(),
  note: z
    .string()
    .trim()
    .min(5, "Say what you checked (at least 5 characters)")
    .max(1000),
});

const optionalBps = z.number().int().min(0).max(10000).nullable();

// A new rule version. Versions are never edited; this publishes the next
// one, inactive. Caps are whole numbers (pesewas / counts).
export const rewardRuleVersionSchema = z.object({
  ruleKey: z.enum([
    "event_referral",
    "friend_referral_referrer",
    "friend_referral_referee",
    "organizer_rebate",
    "venue_rebate",
    "organizer_milestone",
    "loyalty_fee_rebate",
    "promoter_commission",
    "place_visits",
  ]),
  rateBps: optionalBps,
  netShareCapBps: optionalBps,
  flatMinor: z.number().int().min(0).max(1000000).nullable(),
  minBasisMinor: z.number().int().min(0).max(100000000),
  caps: z.record(z.string().regex(/^[a-z_]+$/), z.number().int().min(0)),
  expiryDays: z.number().int().min(1).max(3650).nullable(),
  note: z.string().trim().min(3, "Describe the change").max(500),
  reason: creditReason,
});

export const rewardRuleActivationSchema = z.object({
  ruleKey: rewardRuleVersionSchema.shape.ruleKey,
  ruleId: z.string().uuid().nullable(),
  reason: creditReason,
});

// Run the monthly rebates for one month by hand (the first of the month).
export const rebateRunSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, "Pick a month"),
  reason: creditReason,
});

export type ReportResolveInput = z.infer<typeof reportResolveSchema>;
export type ModerationActionInput = z.infer<typeof moderationActionSchema>;
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;
