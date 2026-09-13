import { WEEKLY_SECTION_ICON_KEYS } from "@abonten/core/weekly/sectionIcons";
import {
  WEEKLY_LAYOUTS,
  WEEKLY_SECTION_KIND_KEYS,
} from "@abonten/core/weekly/sectionKinds";
import { isWeekStart } from "@abonten/core/weekly/week";
import { z } from "zod";

// Abonten Weekly inputs: the public edition read (web Server Actions and
// GET /api/mobile/weekly) and every admin console write. Lengths mirror the
// CHECK constraints in supabase/migrations/20260913120000_weekly_core.sql so
// a request is refused here with a readable message before the database
// would refuse it. Text is sanitised again in the service layer.

const uuid = z.string().uuid("Invalid id");

const optionalNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().finite().min(min).max(max).optional(),
  );

export const WEEKLY_SCOPE_SLUG_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RESERVED_SLUGS = new Set(["preview", "archive", "new"]);

const scopeSlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(WEEKLY_SCOPE_SLUG_PATTERN, "Use lowercase letters, numbers and dashes")
  .refine((s) => !RESERVED_SLUGS.has(s), "That address is reserved");

const weekStart = z
  .string()
  .refine(isWeekStart, "Pick the Monday that starts the week");

const optionalText = (max: number, message: string) =>
  z.string().max(max, message).optional().nullable();

const reason = z
  .string()
  .trim()
  .min(5, "Give a short reason for this change")
  .max(500);

const expectedVersion = z.number().int().min(1);

// ── Public ───────────────────────────────────────────────────────────

export const weeklyEditionRequestSchema = z.object({
  scope: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    scopeSlug.optional(),
  ),
  week: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    weekStart.optional(),
  ),
  lat: optionalNumber(-90, 90),
  lng: optionalNumber(-180, 180),
});
export type WeeklyEditionRequest = z.infer<typeof weeklyEditionRequestSchema>;

export const weeklyTeaserRequestSchema = z.object({
  lat: optionalNumber(-90, 90),
  lng: optionalNumber(-180, 180),
});
export type WeeklyTeaserRequest = z.infer<typeof weeklyTeaserRequestSchema>;

// ── Admin: editions ─────────────────────────────────────────────────

export const weeklyEditionListSchema = z.object({
  status: z.enum(["draft", "scheduled", "published", "archived"]).optional(),
  scopeId: uuid.optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const createWeeklyEditionSchema = z.object({
  scopeId: uuid,
  weekStart,
  title: z.string().trim().min(1, "Give the edition a title").max(80),
  subtitle: optionalText(160, "Keep the subtitle under 160 characters"),
  intro: optionalText(600, "Keep the introduction under 600 characters"),
  /** Copy sections and listings from this edition. */
  duplicateFrom: uuid.optional().nullable(),
  /** Start with the default sections (ignored when duplicating). */
  useTemplate: z.boolean().default(true),
});
export type CreateWeeklyEditionInput = z.infer<
  typeof createWeeklyEditionSchema
>;

export const updateWeeklyEditionSchema = z.object({
  editionId: uuid,
  expectedVersion,
  patch: z
    .object({
      title: z.string().trim().min(1, "Give the edition a title").max(80),
      subtitle: optionalText(160, "Keep the subtitle under 160 characters"),
      intro: optionalText(600, "Keep the introduction under 600 characters"),
    })
    .strict()
    .partial(),
});
export type UpdateWeeklyEditionInput = z.infer<
  typeof updateWeeklyEditionSchema
>;

const sectionFields = z
  .object({
    kind: z.enum(WEEKLY_SECTION_KIND_KEYS as [string, ...string[]]),
    layout: z.enum(WEEKLY_LAYOUTS as [string, ...string[]]),
    subjectScope: z.enum(["events", "places", "mixed"]),
    title: z.string().trim().min(1, "Give the section a title").max(80),
    subtitle: optionalText(160, "Keep the subtitle under 160 characters"),
    iconKey: z
      .enum(WEEKLY_SECTION_ICON_KEYS as [string, ...string[]])
      .optional()
      .nullable(),
    body: optionalText(1200, "Keep the text under 1,200 characters"),
    isVisible: z.boolean(),
  })
  .strict();

export const addWeeklySectionSchema = z.object({
  editionId: uuid,
  expectedVersion,
  section: sectionFields.partial().extend({
    kind: sectionFields.shape.kind,
  }),
});
export type AddWeeklySectionInput = z.infer<typeof addWeeklySectionSchema>;

export const updateWeeklySectionSchema = z.object({
  editionId: uuid,
  expectedVersion,
  sectionId: uuid,
  patch: sectionFields.partial(),
});
export type UpdateWeeklySectionInput = z.infer<
  typeof updateWeeklySectionSchema
>;

export const deleteWeeklySectionSchema = z.object({
  editionId: uuid,
  expectedVersion,
  sectionId: uuid,
});

export const reorderWeeklySectionsSchema = z.object({
  editionId: uuid,
  expectedVersion,
  sectionIds: z.array(uuid).min(1).max(40),
});

// ── Admin: items ────────────────────────────────────────────────────

export const addWeeklyItemSchema = z.object({
  editionId: uuid,
  expectedVersion,
  sectionId: uuid,
  subjectType: z.enum(["event", "place"]),
  subjectId: uuid,
  headline: optionalText(80, "Keep the headline under 80 characters"),
  blurb: optionalText(200, "Keep the note under 200 characters"),
});
export type AddWeeklyItemInput = z.infer<typeof addWeeklyItemSchema>;

export const updateWeeklyItemSchema = z.object({
  editionId: uuid,
  expectedVersion,
  itemId: uuid,
  patch: z
    .object({
      headline: optionalText(80, "Keep the headline under 80 characters"),
      blurb: optionalText(200, "Keep the note under 200 characters"),
      pinned: z.boolean(),
    })
    .strict()
    .partial(),
  moveToSectionId: uuid.optional(),
});
export type UpdateWeeklyItemInput = z.infer<typeof updateWeeklyItemSchema>;

export const removeWeeklyItemSchema = z.object({
  editionId: uuid,
  expectedVersion,
  itemId: uuid,
});

export const reorderWeeklyItemsSchema = z.object({
  editionId: uuid,
  expectedVersion,
  sectionId: uuid,
  itemIds: z.array(uuid).min(1).max(40),
});

export const weeklySubjectSearchSchema = z.object({
  q: z.string().trim().min(2, "Type at least two characters").max(80),
  subjectType: z.enum(["event", "place", "any"]).default("any"),
});

// ── Admin: lifecycle ────────────────────────────────────────────────

export const weeklyTransitionSchema = z
  .object({
    editionId: uuid,
    expectedVersion,
    action: z.enum([
      "schedule",
      "unschedule",
      "publish",
      "unpublish",
      "archive",
      "restore",
    ]),
    scheduledFor: z
      .string()
      .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date")
      .optional()
      .nullable(),
    reason: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "schedule" && !value.scheduledFor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledFor"],
        message: "Choose when to publish",
      });
    }
    if (
      ["publish", "unpublish", "schedule"].includes(value.action) &&
      (value.reason ?? "").trim().length < 5
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "Give a short reason (at least 5 characters)",
      });
    }
  });
export type WeeklyTransitionInput = z.infer<typeof weeklyTransitionSchema>;

export const weeklyPreviewLinkSchema = z.object({ editionId: uuid });

// ── Admin: scopes and settings ──────────────────────────────────────

export const weeklyScopeSchema = z.object({
  /** Omit to create a new scope. */
  scopeId: uuid.optional(),
  expectedUpdatedAt: z.string().optional(),
  reason,
  scope: z
    .object({
      name: z.string().trim().min(2, "Name the area").max(60),
      slug: scopeSlug,
      centreLat: z.number().min(-90).max(90),
      centreLng: z.number().min(-180).max(180),
      radiusKm: z.number().min(1).max(300),
      status: z.enum(["active", "retired"]),
      position: z.number().int().min(0).max(1000),
    })
    .strict()
    .partial(),
});
export type WeeklyScopeInput = z.infer<typeof weeklyScopeSchema>;

export const weeklySettingsSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  reason,
  patch: z
    .object({
      enabled: z.boolean(),
      audience: z.enum(["staff", "beta", "all"]),
      betaUserIds: z.array(uuid).max(500),
      teaserEnabled: z.boolean(),
      defaultPublishHourLocal: z.number().int().min(0).max(23),
      maxItemsPerSection: z.number().int().min(1).max(30),
      maxPerOrganizerPerSection: z.number().int().min(1).max(10),
      exposureLookbackEditions: z.number().int().min(0).max(12),
      editionRetentionWeeks: z.number().int().min(4).max(520),
    })
    .strict()
    .partial(),
});
export type WeeklySettingsInput = z.infer<typeof weeklySettingsSchema>;
