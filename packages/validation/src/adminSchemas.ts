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

export const reviewClaimSchema = z.object({
  claimId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(2000).optional(),
  // optimistic concurrency: the status the client last saw ("pending")
  expectedStatus: z.enum(["pending", "approved", "rejected"]).optional(),
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

export type ReportResolveInput = z.infer<typeof reportResolveSchema>;
export type ModerationActionInput = z.infer<typeof moderationActionSchema>;
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;
