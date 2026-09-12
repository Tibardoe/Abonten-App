// Shared vocabulary for Trust & Verification (PROJECT.md §30).
// One definition per concept across web, mobile and the admin console.
//
// The unions live here (not in @abonten/core) because @abonten/core already
// depends on @abonten/types — the transition RULES table in
// @abonten/core/verification/stateMachine imports these.

export type VerificationSubjectType = "place" | "organizer";

export type OrganizerType = "individual" | "business" | "organisation";

export type VerificationStatus =
  | "draft"
  | "pending_review"
  | "needs_info"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "revoked";

export type VerificationAction =
  | "submit"
  | "resubmit"
  | "withdraw"
  | "approve"
  | "reject"
  | "request_info"
  | "revoke";

export type VerificationActorKind = "user" | "admin" | "system";

/** Keys seeded into verification_evidence_type. New ones need no code change. */
export type VerificationEvidenceTypeKey =
  | "business_registration"
  | "operating_permit"
  | "sector_licence"
  | "tin_certificate"
  | "lease_or_tenancy"
  | "utility_bill"
  | "authorisation_letter"
  | "event_permit"
  | "venue_confirmation"
  | "past_event_material"
  | "other"
  // The table is the authority — tolerate categories added by an INSERT.
  | (string & {});

export type VerificationEvidenceType = {
  key: VerificationEvidenceTypeKey;
  label: string;
  description: string | null;
  appliesTo: VerificationSubjectType[];
  sortOrder: number;
};

export type VerificationEvidenceStatus =
  | "pending_upload"
  | "uploaded"
  | "purged";

/**
 * What the OWNER is allowed to see about their own evidence: enough to
 * manage the list, never a URL. Only admins holding verification.evidence
 * get a (5-minute) link.
 */
export type VerificationEvidenceSummary = {
  id: string;
  evidenceType: VerificationEvidenceTypeKey;
  evidenceTypeLabel: string | null;
  fileName: string | null;
  mimeType: string;
  sizeBytes: number;
  status: VerificationEvidenceStatus;
  createdAt: string;
};

/** One line of the owner-visible history. Carries no internal notes. */
export type VerificationHistoryEntry = {
  id: number;
  eventType: string;
  actorKind: VerificationActorKind;
  fromStatus: VerificationStatus | null;
  toStatus: VerificationStatus | null;
  /** The same reason the owner is shown on the status card. */
  reason: string | null;
  createdAt: string;
};

/**
 * The owner-facing view of one case. Deliberately omits reviewed_by /
 * revoked_by / actor ids and anything from admin_note — a requester must
 * never learn which Abonten reviewer handled their request.
 */
export type VerificationCaseSummary = {
  id: string;
  subjectType: VerificationSubjectType;
  subjectId: string;
  status: VerificationStatus;
  organizerType: OrganizerType | null;
  legalName: string | null;
  applicantNote: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  /** Shown on needs_info / rejected / revoked. */
  decisionReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  evidence: VerificationEvidenceSummary[];
  history: VerificationHistoryEntry[];
};

/** Everything a subject's verification screen needs in one round trip. */
export type SubjectVerificationView = {
  subjectType: VerificationSubjectType;
  subjectId: string;
  subjectName: string | null;
  /** The live approval, if any. */
  approved: VerificationCaseSummary | null;
  /** The case the owner can still act on (draft / pending / needs_info). */
  openCase: VerificationCaseSummary | null;
  /** The most recent closed case, so a rejection reason survives. */
  lastClosedCase: VerificationCaseSummary | null;
  /** May this owner start a request right now? */
  canStart: boolean;
  /** Why not, when canStart is false (program off, not published, ...). */
  blockedReason: string | null;
  evidenceTypes: VerificationEvidenceType[];
  program: VerificationProgram;
};

/** The resolved programme switches for one caller. Ships all-off. */
export type VerificationProgram = {
  placeRequestsEnabled: boolean;
  organizerRequestsEnabled: boolean;
  organizerTypes: OrganizerType[];
  maxEvidenceFiles: number;
  maxFileBytes: number;
};

export const DISABLED_VERIFICATION_PROGRAM: VerificationProgram = {
  placeRequestsEnabled: false,
  organizerRequestsEnabled: false,
  organizerTypes: [],
  maxEvidenceFiles: 5,
  maxFileBytes: 10 * 1024 * 1024,
};

/** A one-shot ticket for uploading straight into the private bucket. */
export type VerificationUploadTicket = {
  evidenceId: string;
  bucket: string;
  path: string;
  token: string;
};

export const VERIFICATION_EVIDENCE_BUCKET = "verification-evidence";

export const VERIFICATION_EVIDENCE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

export type VerificationEvidenceMimeType =
  (typeof VERIFICATION_EVIDENCE_MIME_TYPES)[number];

/** Bucket-level cap. The programme setting may be lower, never higher. */
export const VERIFICATION_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
