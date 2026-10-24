// Identity verification: the person behind an organizer or a place proves
// who they are with a government ID and a live selfie, checked by an
// identity provider. Mirrors
// supabase/migrations/20261023100000_identity_verification.sql; the design
// is docs/architecture/identity-verification.md.

export type IdentityAudience = "staff" | "beta" | "all";

export type IdentityProviderKey = "smile_id" | "test";

/**
 * created → submitted → processing → approved | needs_review | rejected | failed;
 * approved → revoked | expired; created | submitted → cancelled | expired.
 */
export type IdentityVerificationStatus =
  | "created"
  | "submitted"
  | "processing"
  | "approved"
  | "needs_review"
  | "rejected"
  | "failed"
  | "expired"
  | "cancelled"
  | "revoked";

export type IdentityTransitionAction =
  | "submit"
  | "process"
  | "approve"
  | "refer"
  | "reject"
  | "fail"
  | "expire"
  | "cancel"
  | "revoke";

export type IdentityActorKind = "user" | "system" | "staff" | "provider";

/** The provider's verdict, as the provider words it. */
export type IdentityResultStatus = "clear" | "attention" | "block" | "error";

/** What a verified identity can be required for. */
export type IdentityPurpose =
  | "payouts"
  | "place_claims"
  | "verified_badges"
  | "paid_events";

/** One document a market accepts, in the provider's own codes. */
export type IdentityDocumentOption = {
  /** e.g. GHANA_CARD, PASSPORT, DRIVERS_LICENSE, VOTER_ID */
  type: string;
  /** e.g. biometric_kyc, document_verification */
  method: string;
};

export type IdentityMarketConfig = {
  provider: IdentityProviderKey | null;
  documents: IdentityDocumentOption[];
};

/** What the signed-in person may use. Fails closed. */
export type IdentityProgram = {
  enabled: boolean;
  requiredFor: IdentityPurpose[];
  minimumAge: number;
};

export const DISABLED_IDENTITY_PROGRAM: IdentityProgram = {
  enabled: false,
  requiredFor: [],
  minimumAge: 18,
};

/** The person's own view of where they stand. */
export type IdentityState =
  | "not_started"
  | "in_progress"
  | "in_review"
  | "verified"
  | "expired"
  | "rejected"
  | "failed";

export type IdentityAttemptSummary = {
  id: string;
  status: IdentityVerificationStatus;
  documentCountry: string;
  documentType: string;
  createdAt: string;
  decidedAt: string | null;
  /** Shown to the person when it was rejected or failed (worded for them). */
  outcome: IdentityOutcomeCode | null;
};

/** Why an attempt ended as it did, in words the person can act on. */
export type IdentityOutcomeCode =
  | "document_expired"
  | "document_unreadable"
  | "document_not_genuine"
  | "face_mismatch"
  | "selfie_not_live"
  | "underage"
  | "duplicate"
  | "provider_error"
  | "not_finished"
  | "other";

export type IdentityOverview = {
  program: IdentityProgram;
  state: IdentityState;
  /** Present while verified: the name on the document, for the person only. */
  verifiedName: string | null;
  verifiedAt: string | null;
  validUntil: string | null;
  /** The attempt that decides the state (open, in review or the last one). */
  current: IdentityAttemptSummary | null;
  /** An open attempt whose link can be reopened. */
  resumeUrl: string | null;
  documents: { country: string; options: IdentityDocumentOption[] }[];
  attemptsLeftToday: number;
  /** The provider is not set up on this deployment: nothing can start. */
  providerReady: boolean;
};

export type StartIdentityVerificationResult = {
  verificationId: string;
  url: string;
};

// ── Admin ───────────────────────────────────────────────────────────

export type IdentityAdminSettings = {
  enabled: boolean;
  audience: IdentityAudience;
  betaUserIds: string[];
  requireForPayouts: boolean;
  requireForPlaceClaims: boolean;
  requireForVerifiedBadges: boolean;
  requireForPaidEvents: boolean;
  autoApproveClear: boolean;
  attemptsPerDay: number;
  attemptsPer30Days: number;
  minimumAge: number;
  validityMonths: number;
  linkExpiryHours: number;
  retentionDaysUnsuccessful: number;
  retentionDaysAfterDeletion: number;
  retentionDaysFraud: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type IdentityAdminRow = {
  id: string;
  userId: string;
  username: string | null;
  displayName: string | null;
  accountStatus: number | null;
  provider: IdentityProviderKey;
  status: IdentityVerificationStatus;
  documentCountry: string;
  documentType: string;
  resultStatus: IdentityResultStatus | null;
  resultReason: string | null;
  riskLevel: string | null;
  fraudDetected: boolean | null;
  matchedAccounts: number;
  createdAt: string;
  decidedAt: string | null;
};

export type IdentityAdminMatch = {
  userId: string;
  username: string | null;
  accountStatus: number | null;
  verificationStatus: IdentityVerificationStatus;
  revoked: boolean;
};

export type IdentityAdminEvent = {
  kind: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorKind: IdentityActorKind;
  reason: string | null;
  at: string;
};

/** The personal details, shown only with identity.view_pii (audited). */
export type IdentityAdminPii = {
  legalName: string | null;
  dateOfBirth: string | null;
  idNumberLast4: string | null;
  documentExpiresOn: string | null;
  profileName: string | null;
};

export type IdentityAdminDetail = IdentityAdminRow & {
  verificationMethod: string;
  providerJobId: string | null;
  providerDuplicate: boolean | null;
  isAdult: boolean | null;
  decisionSource: "auto" | "staff" | "system" | null;
  decisionReason: string | null;
  validUntil: string | null;
  consentAt: string;
  consentNoticeVersion: string;
  accountDeletedAt: string | null;
  matches: IdentityAdminMatch[];
  events: IdentityAdminEvent[];
  /** Null unless the caller holds identity.view_pii. */
  pii: IdentityAdminPii | null;
};
