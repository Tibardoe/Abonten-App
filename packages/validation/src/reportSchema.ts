import {
  REPORTABLE_CATEGORIES,
  type ReportCategory,
  type ReportTargetType,
} from "@abonten/types/adminTypes";
import { z } from "zod";

// User-facing "Report this content" form. Shared verbatim by the web
// ReportDialog and the mobile ReportSheet. The reporter identity is NEVER
// part of this payload — submitReportCore derives it from the session.

const TARGET_TYPES = [
  "event",
  "place",
  "event_review",
  "place_review",
  "user_review",
  "user",
  "organizer",
  "highlight",
] as const satisfies readonly ReportTargetType[];

const CATEGORIES = [
  "spam",
  "fraud_scam",
  "misleading",
  "harassment",
  "inappropriate",
  "fake_listing",
  "safety",
  "copyright",
  "impersonation",
  "other",
] as const satisfies readonly ReportCategory[];

export const reportAttachmentMetaSchema = z.object({
  storagePath: z.string().min(1),
  fileName: z.string().max(255).nullable().default(null),
  mimeType: z.string().max(120).nullable().default(null),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024)
    .nullable()
    .default(null),
});

export const submitReportSchema = z
  .object({
    targetType: z.enum(TARGET_TYPES),
    targetId: z.string().uuid("A valid target is required"),
    category: z.enum(CATEGORIES, {
      errorMap: () => ({ message: "Choose a reason" }),
    }),
    details: z
      .string()
      .trim()
      .max(2000, "Keep the description under 2000 characters")
      .optional()
      .or(z.literal("")),
    attachment: reportAttachmentMetaSchema.nullable().optional(),
  })
  .superRefine((val, ctx) => {
    const allowed = REPORTABLE_CATEGORIES[val.targetType];
    if (allowed && !allowed.includes(val.category)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "That reason doesn't apply to this kind of content",
      });
    }
  });

export type SubmitReportInput = z.infer<typeof submitReportSchema>;

// Allowed upload types / size for a report attachment — mirrors the
// report-attachments bucket config in the migration and the signed-upload
// limits added in the 2026-09 audit.
export const REPORT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const REPORT_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;
