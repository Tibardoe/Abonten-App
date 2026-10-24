import type {
  IdentityActorKind,
  IdentityOutcomeCode,
  IdentityResultStatus,
  IdentityState,
  IdentityTransitionAction,
  IdentityVerificationStatus,
} from "@abonten/types/identityType";
import { foldSearchText } from "../search/foldSearchText";

// Identity verification rules, framework-free. The state machine mirrors
// identity_transition() in
// supabase/migrations/20261023100000_identity_verification.sql: the database
// is the authority, this copy lets the services and the console say "not
// possible" before asking, and keeps the decision from a provider's verdict
// in one tested place.

const AUTO: IdentityActorKind[] = ["system", "provider"];

type Rule = {
  action: IdentityTransitionAction;
  actors: IdentityActorKind[];
  from: IdentityVerificationStatus[];
  to: IdentityVerificationStatus;
};

export const IDENTITY_TRANSITIONS: Rule[] = [
  {
    action: "submit",
    actors: ["user", ...AUTO],
    from: ["created"],
    to: "submitted",
  },
  {
    action: "process",
    actors: AUTO,
    from: ["created", "submitted"],
    to: "processing",
  },
  {
    action: "approve",
    actors: AUTO,
    from: ["created", "submitted", "processing"],
    to: "approved",
  },
  {
    action: "approve",
    actors: ["staff"],
    from: ["needs_review"],
    to: "approved",
  },
  {
    action: "refer",
    actors: AUTO,
    from: ["created", "submitted", "processing"],
    to: "needs_review",
  },
  {
    action: "reject",
    actors: AUTO,
    from: ["created", "submitted", "processing"],
    to: "rejected",
  },
  {
    action: "reject",
    actors: ["staff"],
    from: ["needs_review"],
    to: "rejected",
  },
  {
    action: "fail",
    actors: AUTO,
    from: ["created", "submitted", "processing"],
    to: "failed",
  },
  {
    action: "expire",
    actors: ["system"],
    from: ["created", "submitted", "approved"],
    to: "expired",
  },
  {
    action: "cancel",
    actors: ["user", "system"],
    from: ["created", "submitted"],
    to: "cancelled",
  },
  {
    action: "revoke",
    actors: ["staff", "system"],
    from: ["approved"],
    to: "revoked",
  },
];

export function identityTransitionTarget(
  from: IdentityVerificationStatus,
  action: IdentityTransitionAction,
  actor: IdentityActorKind,
): IdentityVerificationStatus | null {
  const rule = IDENTITY_TRANSITIONS.find(
    (r) =>
      r.action === action && r.actors.includes(actor) && r.from.includes(from),
  );
  return rule ? rule.to : null;
}

export const OPEN_IDENTITY_STATUSES: IdentityVerificationStatus[] = [
  "created",
  "submitted",
  "processing",
];

export function isOpenIdentityStatus(
  status: IdentityVerificationStatus,
): boolean {
  return OPEN_IDENTITY_STATUSES.includes(status);
}

// ── Deciding on a provider's verdict ─────────────────────────────────

export type IdentityDecisionInput = {
  resultStatus: IdentityResultStatus;
  /** The provider's reason code, as it came (lower snake case). */
  resultReason: string | null;
  fraudDetected: boolean | null;
  /** The provider saw this face or document on another of its users. */
  providerDuplicate: boolean | null;
  /** False when the date of birth shows the person is under age. */
  isAdult: boolean | null;
  /** The document's own expiry, ISO date. */
  documentExpiresOn: string | null;
  /** Other Abonten accounts that showed the same document. */
  matchedAccounts: number;
  /** One of those accounts is banned or had its check revoked. */
  matchedAccountClosedForCause: boolean;
  autoApproveClear: boolean;
  /** ISO date of today in the person's market. */
  today: string;
};

export type IdentityDecision = {
  action: Extract<
    IdentityTransitionAction,
    "approve" | "refer" | "reject" | "fail"
  >;
  outcome: IdentityOutcomeCode | null;
  /** Why it went to a person, for the review queue. */
  reviewReason: string | null;
};

const BLOCK_OUTCOMES: Record<string, IdentityOutcomeCode> = {
  face_verification_failed: "face_mismatch",
  spoof_detected: "selfie_not_live",
  document_check_failed: "document_not_genuine",
  unsupported_document: "document_unreadable",
  age_requirement_not_met: "underage",
  document_expired: "document_expired",
};

const ERROR_OUTCOMES: Record<string, IdentityOutcomeCode> = {
  image_unavailable_or_invalid: "document_unreadable",
  document_unclassifiable: "document_unreadable",
  content_policy_violated: "document_unreadable",
};

/**
 * What to do with a provider's verdict. A clean result is approved only when
 * nothing else needs a person: the person is of age, the document has not
 * expired, and no other Abonten account showed the same document. Anything
 * uncertain goes to review; a stolen-ID case must not be rejected by a rule
 * alone, so a match with a closed account is reviewed, not auto-rejected.
 */
export function decideIdentityOutcome(
  input: IdentityDecisionInput,
): IdentityDecision {
  const reason = input.resultReason ?? "";

  if (input.resultStatus === "error") {
    return {
      action: "fail",
      outcome: ERROR_OUTCOMES[reason] ?? "provider_error",
      reviewReason: null,
    };
  }

  if (input.resultStatus === "block") {
    return {
      action: "reject",
      outcome: BLOCK_OUTCOMES[reason] ?? "other",
      reviewReason: null,
    };
  }

  // Facts that decide whatever the provider's mood: under age, expired.
  if (input.isAdult === false || reason === "age_requirement_not_met") {
    return { action: "reject", outcome: "underage", reviewReason: null };
  }
  if (
    reason === "document_expired" ||
    (input.documentExpiresOn !== null && input.documentExpiresOn < input.today)
  ) {
    return {
      action: "reject",
      outcome: "document_expired",
      reviewReason: null,
    };
  }

  if (input.matchedAccounts > 0) {
    return {
      action: "refer",
      outcome: null,
      reviewReason: input.matchedAccountClosedForCause
        ? "document_on_closed_account"
        : "document_on_other_account",
    };
  }

  if (input.resultStatus === "attention") {
    return {
      action: "refer",
      outcome: null,
      reviewReason: reason || "provider_attention",
    };
  }

  if (input.fraudDetected || input.providerDuplicate) {
    return {
      action: "refer",
      outcome: null,
      reviewReason: input.fraudDetected
        ? "fraud_signals"
        : "provider_duplicate",
    };
  }

  if (!input.autoApproveClear) {
    return { action: "refer", outcome: null, reviewReason: "manual_review_on" };
  }

  return { action: "approve", outcome: null, reviewReason: null };
}

/** Why a rejected or failed attempt ended, worded for the person later. */
export function outcomeFromStored(
  status: IdentityVerificationStatus,
  resultStatus: IdentityResultStatus | null,
  resultReason: string | null,
  decisionReason: string | null,
): IdentityOutcomeCode | null {
  if (status === "expired" && !resultStatus) return "not_finished";
  if (status === "failed") {
    return ERROR_OUTCOMES[resultReason ?? ""] ?? "provider_error";
  }
  if (status === "revoked") return "other";
  if (status !== "rejected") return null;
  if (decisionReason === "underage") return "underage";
  if (decisionReason === "document_expired") return "document_expired";
  if (decisionReason?.startsWith("document_on_")) return "duplicate";
  if (resultStatus === "block") {
    return BLOCK_OUTCOMES[resultReason ?? ""] ?? "other";
  }
  if (resultReason === "document_expired") return "document_expired";
  return "other";
}

// ── The person's state ───────────────────────────────────────────────

export function identityStateOf(
  current: { status: IdentityVerificationStatus } | null,
  verified: boolean,
): IdentityState {
  if (verified) return "verified";
  if (!current) return "not_started";
  switch (current.status) {
    case "created":
    case "submitted":
    case "processing":
      return "in_progress";
    case "needs_review":
      return "in_review";
    // Approved but no longer live: past its date before the nightly job
    // marked it, or the account is not active.
    case "approved":
    case "expired":
      return "expired";
    // Taken away by staff: the person is told to ask support why, and may
    // try again (a new attempt then goes to review, see matches).
    case "revoked":
    case "rejected":
      return "rejected";
    case "failed":
      return "failed";
    case "cancelled":
      return "not_started";
  }
}

// ── Facts from the document ──────────────────────────────────────────

/** Age in whole years on `onDate` (ISO dates). */
export function ageOn(dateOfBirth: string, onDate: string): number | null {
  const birth = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  const on = /^(\d{4})-(\d{2})-(\d{2})$/.exec(onDate);
  if (!birth || !on) return null;
  let age = Number(on[1]) - Number(birth[1]);
  const beforeBirthday =
    Number(on[2]) < Number(birth[2]) ||
    (Number(on[2]) === Number(birth[2]) && Number(on[3]) < Number(birth[3]));
  if (beforeBirthday) age -= 1;
  return age;
}

/** A document number as a provider prints it, reduced to its characters. */
export function normalizeIdNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The last four characters, for staff to tell two documents apart. */
export function idNumberLastFour(value: string): string | null {
  const normalized = normalizeIdNumber(value);
  return normalized ? normalized.slice(-4) : null;
}

/** An ISO date (YYYY-MM-DD) or null. */
export function isoDateOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

// ── Names ────────────────────────────────────────────────────────────

function nameTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return foldSearchText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * Whether two names plausibly belong to the same person: every word of the
 * shorter name appears in the longer one, or they share at least two words.
 * "Ama K. Mensah" matches "MENSAH AMA KORKOR"; "Ama Mensah" does not match
 * "Kofi Mensah". It is a warning for staff (a payout account in someone
 * else's name), never a decision on its own.
 */
export function namesLikelyMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (x.length === 0 || y.length === 0) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const longSet = new Set(long);
  const shared = short.filter((t) => longSet.has(t)).length;
  return shared === short.length || shared >= 2;
}
