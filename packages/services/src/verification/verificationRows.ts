import { logger } from "@abonten/core/logger";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type VerificationCaseSummary,
  type VerificationEvidenceSummary,
  type VerificationEvidenceType,
  type VerificationHistoryEntry,
  type VerificationStatus,
  type VerificationSubjectType,
} from "@abonten/types/verificationType";

// Column lists, row shapes and row -> DTO mappers for Trust & Verification,
// shared by the owner-facing cores and the admin cores so one column is
// never selected two different ways.

export const VERIFICATION_EVIDENCE_BUCKET = "verification-evidence";

/** MIME -> file extension for the storage object key. Mirrors the bucket's allow-list. */
export const EVIDENCE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export const CASE_COLUMNS =
  "id, subject_type, place_id, organizer_user_id, subject_id, requester_id, status, organizer_type, legal_name, applicant_note, contact_phone, contact_email, subject_snapshot, decision_reason, source, claim_request_id, submitted_at, info_requested_at, reviewed_by, reviewed_at, revoked_by, revoked_at, created_at, updated_at";

export const EVIDENCE_COLUMNS =
  "id, case_id, evidence_type, storage_path, file_name, mime_type, size_bytes, status, uploaded_by, created_at, uploaded_at";

export const EVENT_COLUMNS =
  "id, case_id, actor_id, actor_kind, event_type, from_status, to_status, reason, meta, created_at";

export type CaseRow = {
  id: string;
  subject_type: string;
  place_id: string | null;
  organizer_user_id: string | null;
  subject_id: string | null;
  requester_id: string;
  status: string;
  organizer_type: string | null;
  legal_name: string | null;
  applicant_note: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  subject_snapshot: unknown;
  decision_reason: string | null;
  source: string;
  claim_request_id: string | null;
  submitted_at: string | null;
  info_requested_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  revoked_by: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EvidenceRow = {
  id: string;
  case_id: string;
  evidence_type: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string;
  size_bytes: number;
  status: string;
  uploaded_by: string;
  created_at: string;
  uploaded_at: string | null;
};

export type EventRow = {
  id: number;
  case_id: string;
  actor_id: string | null;
  actor_kind: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  meta: unknown;
  created_at: string;
};

/** The envelope every verification core returns. */
export type VerificationEnvelope<T = undefined> = {
  status: number;
  message?: string;
  data?: T;
};

/**
 * Maps a Postgres error from verification_transition() to an HTTP status and
 * a sentence the owner can act on. The RPC raises stable message keys rather
 * than prose precisely so this mapping can live in one place.
 */
export function transitionError(
  error: { message?: string; code?: string },
  fallback = "Something went wrong!",
): VerificationEnvelope {
  const msg = error.message ?? "";
  if (msg.includes("verification_case_not_found")) {
    return { status: 404, message: "Verification request not found" };
  }
  if (msg.includes("verification_status_changed")) {
    return {
      status: 409,
      message: "This request changed since you opened it. Reload and try again.",
    };
  }
  if (msg.includes("verification_invalid_transition")) {
    return {
      status: 409,
      message: "That can no longer be done to this request.",
    };
  }
  if (msg.includes("verification_reason_required")) {
    return { status: 400, message: "A reason is required." };
  }
  if (msg.includes("verification_no_evidence")) {
    return {
      status: 422,
      message: "Add at least one document before sending your request.",
    };
  }
  if (msg.includes("verification_subject_ineligible")) {
    return {
      status: 409,
      message:
        "This can't be verified right now. Check that the listing is published and still belongs to you.",
    };
  }
  // 40P01 is a deadlock: two writers touched the same subject. Retryable.
  if (error.code === "40P01") {
    return { status: 409, message: "Busy — please try again." };
  }
  logger.error(`verification_transition failed: ${msg}`);
  return { status: 500, message: fallback };
}

/**
 * Builds the verification_transition() argument object. `p_reason` and
 * `p_expected_status` carry SQL defaults, so the generated types mark them
 * optional rather than nullable — omit them instead of passing null.
 */
export function transitionArgs(input: {
  caseId: string;
  actorId: string;
  actorKind: "user" | "admin" | "system";
  action: string;
  reason?: string | null;
  expectedStatus?: string | null;
}): {
  p_case_id: string;
  p_actor_id: string;
  p_actor_kind: string;
  p_action: string;
  p_reason?: string;
  p_expected_status?: string;
} {
  const reason = input.reason?.trim();
  return {
    p_case_id: input.caseId,
    p_actor_id: input.actorId,
    p_actor_kind: input.actorKind,
    p_action: input.action,
    ...(reason ? { p_reason: reason } : {}),
    ...(input.expectedStatus ? { p_expected_status: input.expectedStatus } : {}),
  };
}

export function mapEvidence(
  row: EvidenceRow,
  labels?: Map<string, string>,
): VerificationEvidenceSummary {
  return {
    id: row.id,
    evidenceType: row.evidence_type,
    evidenceTypeLabel: labels?.get(row.evidence_type) ?? null,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status as VerificationEvidenceSummary["status"],
    createdAt: row.created_at,
  };
}

/**
 * The owner-visible history. Internal-only signals are dropped, and the
 * actor id is NEVER included — a requester must not learn which reviewer
 * handled their case.
 */
const OWNER_VISIBLE_EVENTS = new Set([
  "created",
  "submitted",
  "resubmitted",
  "info_requested",
  "approved",
  "rejected",
  "withdrawn",
  "revoked",
]);

export function mapHistory(rows: EventRow[]): VerificationHistoryEntry[] {
  return rows
    .filter((r) => OWNER_VISIBLE_EVENTS.has(r.event_type))
    .map((r) => ({
      id: r.id,
      eventType: r.event_type,
      actorKind: r.actor_kind as VerificationHistoryEntry["actorKind"],
      fromStatus: r.from_status as VerificationStatus | null,
      toStatus: r.to_status as VerificationStatus | null,
      reason: r.reason,
      createdAt: r.created_at,
    }));
}

export function mapCase(
  row: CaseRow,
  evidence: EvidenceRow[] = [],
  events: EventRow[] = [],
  labels?: Map<string, string>,
): VerificationCaseSummary {
  return {
    id: row.id,
    subjectType: row.subject_type as VerificationSubjectType,
    subjectId: (row.subject_id ?? row.place_id ?? row.organizer_user_id) as string,
    status: row.status as VerificationStatus,
    organizerType:
      (row.organizer_type as VerificationCaseSummary["organizerType"]) ?? null,
    legalName: row.legal_name,
    applicantNote: row.applicant_note,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    decisionReason: row.decision_reason,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    evidence: evidence.map((e) => mapEvidence(e, labels)),
    history: mapHistory(events),
  };
}

export async function loadEvidenceTypes(
  supabase: ServiceRoleClient,
  subjectType?: VerificationSubjectType,
): Promise<VerificationEvidenceType[]> {
  const { data, error } = await supabase
    .from("verification_evidence_type")
    .select("key, label, description, applies_to, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) {
    logger.error(`loadEvidenceTypes failed: ${error.message}`);
    return [];
  }
  const rows = (data ?? []) as {
    key: string;
    label: string;
    description: string | null;
    applies_to: string[];
    sort_order: number;
  }[];
  return rows
    .filter((r) => !subjectType || (r.applies_to ?? []).includes(subjectType))
    .map((r) => ({
      key: r.key,
      label: r.label,
      description: r.description,
      appliesTo: (r.applies_to ?? []) as VerificationSubjectType[],
      sortOrder: r.sort_order,
    }));
}

export async function evidenceTypeLabels(
  supabase: ServiceRoleClient,
): Promise<Map<string, string>> {
  const types = await loadEvidenceTypes(supabase);
  return new Map(types.map((t) => [t.key, t.label]));
}

/** Storage key: <subject_type>/<subject_id>/<case_id>/<evidence_id>.<ext> */
export function evidencePath(
  subjectType: string,
  subjectId: string,
  caseId: string,
  evidenceId: string,
  mimeType: string,
): string {
  const ext = EVIDENCE_EXT[mimeType] ?? "bin";
  return `${subjectType}/${subjectId}/${caseId}/${evidenceId}.${ext}`;
}
