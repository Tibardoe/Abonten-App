import {
  VERIFICATION_EVIDENCE_MAX_BYTES,
  VERIFICATION_EVIDENCE_MIME_TYPES,
} from "@abonten/types/verificationType";
import { z } from "zod";

// Zod schemas for the owner-facing Trust & Verification mutations. Each web
// Server Action and /api/mobile route validates with one of these before
// calling the matching @abonten/services/verification function. The service
// re-checks ownership and the programme switches regardless — these only
// shape the input.

export const verificationSubjectSchema = z.object({
  subjectType: z.enum(["place", "organizer"]),
  subjectId: z.string().uuid(),
});

const contactPhone = z
  .string()
  .trim()
  .max(40, "That phone number is too long")
  .optional()
  .nullable();

const contactEmail = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .max(320)
  .optional()
  .nullable()
  // An empty string from a cleared input means "not provided".
  .or(z.literal("").transform(() => null));

export const startVerificationSchema = verificationSubjectSchema.extend({
  organizerType: z
    .enum(["individual", "business", "organisation"])
    .optional()
    .nullable(),
  legalName: z
    .string()
    .trim()
    .max(200, "Keep the registered name under 200 characters")
    .optional()
    .nullable(),
  applicantNote: z
    .string()
    .trim()
    .max(1000, "Keep your note under 1000 characters")
    .optional()
    .nullable(),
  contactPhone,
  contactEmail,
});

export const updateVerificationCaseSchema = z.object({
  caseId: z.string().uuid(),
  organizerType: z
    .enum(["individual", "business", "organisation"])
    .optional()
    .nullable(),
  legalName: z.string().trim().max(200).optional().nullable(),
  applicantNote: z.string().trim().max(1000).optional().nullable(),
  contactPhone,
  contactEmail,
});

export const evidenceUploadRequestSchema = z.object({
  caseId: z.string().uuid(),
  evidenceType: z.string().trim().min(1).max(64),
  mimeType: z.enum(VERIFICATION_EVIDENCE_MIME_TYPES, {
    errorMap: () => ({
      message: "Upload a photo (JPEG, PNG, WebP, HEIC) or a PDF",
    }),
  }),
  sizeBytes: z
    .number()
    .int()
    .positive("That file looks empty")
    .max(
      VERIFICATION_EVIDENCE_MAX_BYTES,
      "That file is larger than 10 MB. Try a smaller photo or scan.",
    ),
  fileName: z.string().trim().max(255).optional().nullable(),
});

export const removeEvidenceSchema = z.object({
  caseId: z.string().uuid(),
  evidenceId: z.string().uuid(),
});

export const submitVerificationSchema = z.object({
  caseId: z.string().uuid(),
});

export const withdrawVerificationSchema = z.object({
  caseId: z.string().uuid(),
});

export type StartVerificationInput = z.infer<typeof startVerificationSchema>;
export type UpdateVerificationCaseInput = z.infer<
  typeof updateVerificationCaseSchema
>;
export type EvidenceUploadRequestInput = z.infer<
  typeof evidenceUploadRequestSchema
>;
export type RemoveEvidenceInput = z.infer<typeof removeEvidenceSchema>;
