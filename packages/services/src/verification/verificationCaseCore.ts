import { randomUUID } from "node:crypto";
import { logger } from "@abonten/core/logger";
import { NOTIFICATION_COPY } from "@abonten/core/verification/copy";
import {
  canStartNewCase,
  isEditable,
} from "@abonten/core/verification/stateMachine";
import type { NotificationData } from "@abonten/types/notificationType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  SubjectVerificationView,
  VerificationCaseSummary,
  VerificationProgram,
  VerificationSubjectType,
  VerificationUploadTicket,
} from "@abonten/types/verificationType";
import { createNotificationCore } from "../notifications/createNotification";
import { checkRateLimit } from "../security/rateLimit";
import {
  getVerificationProgramCore,
  isVerificationKillSwitchOn,
  requestsEnabledFor,
} from "./verificationProgram";
import {
  CASE_COLUMNS,
  type CaseRow,
  EVENT_COLUMNS,
  EVIDENCE_COLUMNS,
  type EventRow,
  type EvidenceRow,
  VERIFICATION_EVIDENCE_BUCKET,
  type VerificationEnvelope,
  evidencePath,
  evidenceTypeLabels,
  loadEvidenceTypes,
  mapCase,
  transitionArgs,
  transitionError,
} from "./verificationRows";

// Owner-facing Trust & Verification (PROJECT.md §30).
//
// Every function here takes the SERVICE-ROLE client and the caller's user id.
// The verification tables carry no anon/authenticated privileges at all, so
// the ownership check IS the boundary and it lives here, never in the
// transport — same rule the money-path services follow. A place is owned via
// place.owner_id; an "organizer" subject is always the caller themselves.

const MAX_STARTS_PER_HOUR = 5;
const MAX_UPLOAD_TICKETS_PER_HOUR = 30;

type SubjectInput = {
  subjectType: VerificationSubjectType;
  subjectId: string;
};

type SubjectFacts = {
  name: string | null;
  /** Eligible to have a request submitted right now. */
  eligible: boolean;
  blockedReason: string | null;
};

/**
 * Proves the caller owns the subject, and reports whether it is in a state
 * that can be verified. Returns null when the caller does NOT own it — every
 * caller turns that into a 404, so a probe can't distinguish "not yours"
 * from "does not exist".
 */
async function resolveSubject(
  supabase: ServiceRoleClient,
  userId: string,
  subject: SubjectInput,
): Promise<SubjectFacts | null> {
  if (subject.subjectType === "place") {
    const { data, error } = await supabase
      .from("place")
      .select("id, name, status, moderation_state, owner_id")
      .eq("id", subject.subjectId)
      .maybeSingle();
    if (error) {
      logger.error(`resolveSubject place read failed: ${error.message}`);
      return null;
    }
    if (!data || data.owner_id !== userId) return null;

    const hidden =
      data.moderation_state === "hidden" || data.moderation_state === "removed";
    if (data.status !== "published") {
      return {
        name: data.name,
        eligible: false,
        blockedReason:
          "Publish this place before asking for verification. Drafts and archived places can't be reviewed.",
      };
    }
    if (hidden) {
      return {
        name: data.name,
        eligible: false,
        blockedReason:
          "This listing is currently hidden by Abonten, so it can't be verified.",
      };
    }
    return { name: data.name, eligible: true, blockedReason: null };
  }

  // Organizer verification is self-service only: the subject is the caller.
  if (subject.subjectId !== userId) return null;
  const { data, error } = await supabase
    .from("user_info")
    .select("id, full_name, username, status_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    logger.error(`resolveSubject user read failed: ${error.message}`);
    return null;
  }
  if (!data) return null;
  if (data.status_id !== 1) {
    return {
      name: data.full_name || data.username,
      eligible: false,
      blockedReason:
        "Your account is restricted, so verification isn't available right now.",
    };
  }
  return {
    name: data.full_name || data.username,
    eligible: true,
    blockedReason: null,
  };
}

async function loadCaseWithChildren(
  supabase: ServiceRoleClient,
  row: CaseRow,
  labels: Map<string, string>,
): Promise<VerificationCaseSummary> {
  const [{ data: evidence }, { data: events }] = await Promise.all([
    supabase
      .from("verification_evidence")
      .select(EVIDENCE_COLUMNS)
      .eq("case_id", row.id)
      .neq("status", "purged")
      .order("created_at", { ascending: true }),
    supabase
      .from("verification_event")
      .select(EVENT_COLUMNS)
      .eq("case_id", row.id)
      .order("created_at", { ascending: true }),
  ]);
  return mapCase(
    row,
    (evidence ?? []) as EvidenceRow[],
    (events ?? []) as EventRow[],
    labels,
  );
}

/**
 * Everything the owner's verification screen needs, in one round trip: the
 * live approval, the case they can still act on, the last closed one (so a
 * rejection reason survives), and the programme limits.
 */
export async function getSubjectVerificationCore(
  supabase: ServiceRoleClient,
  userId: string,
  subject: SubjectInput,
): Promise<VerificationEnvelope<SubjectVerificationView>> {
  const facts = await resolveSubject(supabase, userId, subject);
  if (!facts) {
    return { status: 404, message: "Not found" };
  }

  const [program, labels, evidenceTypes] = await Promise.all([
    getVerificationProgramCore(supabase, userId),
    evidenceTypeLabels(supabase),
    loadEvidenceTypes(supabase, subject.subjectType),
  ]);

  const { data, error } = await supabase
    .from("verification_case")
    .select(CASE_COLUMNS)
    .eq("subject_type", subject.subjectType)
    .eq("subject_id", subject.subjectId)
    .order("created_at", { ascending: false });
  if (error) {
    logger.error(`getSubjectVerificationCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const rows = (data ?? []) as CaseRow[];
  const approvedRow = rows.find((r) => r.status === "approved") ?? null;
  const openRow =
    rows.find((r) =>
      ["draft", "pending_review", "needs_info"].includes(r.status),
    ) ?? null;
  const closedRow =
    rows.find((r) => ["rejected", "withdrawn", "revoked"].includes(r.status)) ??
    null;

  const [approved, openCase, lastClosedCase] = await Promise.all([
    approvedRow ? loadCaseWithChildren(supabase, approvedRow, labels) : null,
    openRow ? loadCaseWithChildren(supabase, openRow, labels) : null,
    closedRow ? loadCaseWithChildren(supabase, closedRow, labels) : null,
  ]);

  const programOpen = requestsEnabledFor(program, subject.subjectType);
  const latestStatus = approvedRow?.status ?? openRow?.status ?? null;
  let canStart = true;
  let blockedReason: string | null = null;
  if (!programOpen) {
    canStart = false;
    blockedReason = null; // the UI simply hides the entry point
  } else if (!facts.eligible) {
    canStart = false;
    blockedReason = facts.blockedReason;
  } else if (
    !canStartNewCase(latestStatus as VerificationCaseSummary["status"] | null)
  ) {
    canStart = false;
    blockedReason = approvedRow
      ? "This is already verified."
      : "You already have a request in progress.";
  }

  return {
    status: 200,
    data: {
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      subjectName: facts.name,
      approved,
      openCase,
      lastClosedCase,
      canStart,
      blockedReason,
      evidenceTypes,
      program,
    },
  };
}

export async function getVerificationProgramForUser(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<VerificationEnvelope<VerificationProgram>> {
  const program = await getVerificationProgramCore(supabase, userId);
  return { status: 200, data: program };
}

export type StartVerificationCoreInput = SubjectInput & {
  organizerType?: string | null;
  legalName?: string | null;
  applicantNote?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
};

export async function startVerificationCaseCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: StartVerificationCoreInput,
): Promise<VerificationEnvelope<{ caseId: string }>> {
  if (isVerificationKillSwitchOn()) {
    return { status: 403, message: "Verification isn't available right now." };
  }

  const facts = await resolveSubject(supabase, userId, input);
  if (!facts) return { status: 404, message: "Not found" };

  const program = await getVerificationProgramCore(supabase, userId);
  if (!requestsEnabledFor(program, input.subjectType)) {
    return { status: 403, message: "Verification isn't available right now." };
  }
  if (!facts.eligible) {
    return { status: 409, message: facts.blockedReason ?? "Not eligible" };
  }
  if (
    input.subjectType === "organizer" &&
    input.organizerType &&
    !program.organizerTypes.includes(
      input.organizerType as (typeof program.organizerTypes)[number],
    )
  ) {
    return {
      status: 400,
      message: "That organizer type isn't accepted at the moment.",
    };
  }

  const allowed = await checkRateLimit(
    `verification:start:${userId}`,
    MAX_STARTS_PER_HOUR,
    3600,
  );
  if (!allowed) {
    return {
      status: 429,
      message: "Too many verification requests. Try again later.",
    };
  }

  const { data, error } = await supabase
    .from("verification_case")
    .insert({
      subject_type: input.subjectType,
      place_id: input.subjectType === "place" ? input.subjectId : null,
      organizer_user_id:
        input.subjectType === "organizer" ? input.subjectId : null,
      requester_id: userId,
      status: "draft",
      source: "owner",
      organizer_type: input.organizerType ?? null,
      legal_name: input.legalName ?? null,
      applicant_note: input.applicantNote ?? null,
      contact_phone: input.contactPhone ?? null,
      contact_email: input.contactEmail ?? null,
    } as never)
    .select("id")
    .single();

  if (error) {
    // uq_verification_case_open_per_subject / _approved_per_subject
    if (error.code === "23505") {
      return {
        status: 409,
        message:
          "There is already a verification request for this. Refresh to see it.",
      };
    }
    logger.error(`startVerificationCaseCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  await supabase.from("verification_event").insert({
    case_id: data.id,
    actor_id: userId,
    actor_kind: "user",
    event_type: "created",
    to_status: "draft",
  } as never);

  return { status: 200, data: { caseId: data.id } };
}

/** Loads a case the caller owns and may still edit. */
async function ownedEditableCase(
  supabase: ServiceRoleClient,
  userId: string,
  caseId: string,
): Promise<
  | { ok: true; row: CaseRow }
  // `never` so the failure envelope fits whatever payload the caller returns.
  | { ok: false; result: VerificationEnvelope<never> }
> {
  const { data, error } = await supabase
    .from("verification_case")
    .select(CASE_COLUMNS)
    .eq("id", caseId)
    .maybeSingle();
  if (error) {
    logger.error(`ownedEditableCase failed: ${error.message}`);
    return {
      ok: false,
      result: { status: 500, message: "Something went wrong!" },
    };
  }
  // Not yours reads exactly like not found.
  if (!data || (data as CaseRow).requester_id !== userId) {
    return {
      ok: false,
      result: { status: 404, message: "Verification request not found" },
    };
  }
  const row = data as CaseRow;
  if (!isEditable(row.status as VerificationCaseSummary["status"])) {
    return {
      ok: false,
      result: {
        status: 409,
        message: "This request can no longer be changed.",
      },
    };
  }
  return { ok: true, row };
}

export async function updateVerificationCaseCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: {
    caseId: string;
    organizerType?: string | null;
    legalName?: string | null;
    applicantNote?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
  },
): Promise<VerificationEnvelope> {
  const owned = await ownedEditableCase(supabase, userId, input.caseId);
  if (!owned.ok) return owned.result;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.organizerType !== undefined) {
    if (
      owned.row.subject_type !== "organizer" &&
      input.organizerType !== null
    ) {
      return {
        status: 400,
        message: "Organizer type only applies to organizer verification.",
      };
    }
    patch.organizer_type = input.organizerType;
  }
  if (input.legalName !== undefined) patch.legal_name = input.legalName;
  if (input.applicantNote !== undefined)
    patch.applicant_note = input.applicantNote;
  if (input.contactPhone !== undefined)
    patch.contact_phone = input.contactPhone;
  if (input.contactEmail !== undefined)
    patch.contact_email = input.contactEmail;

  const { error } = await supabase
    .from("verification_case")
    .update(patch as never)
    .eq("id", input.caseId);
  if (error) {
    logger.error(`updateVerificationCaseCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }
  return { status: 200, message: "Saved." };
}

/**
 * Mints a one-shot signed upload URL for the private bucket. The metadata
 * row is written first so the object key is owned before any bytes exist;
 * if signing fails the row is removed again (the Field Ops evidence pattern).
 */
export async function requestVerificationEvidenceUploadCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: {
    caseId: string;
    evidenceType: string;
    mimeType: string;
    sizeBytes: number;
    fileName?: string | null;
  },
): Promise<VerificationEnvelope<VerificationUploadTicket>> {
  const owned = await ownedEditableCase(supabase, userId, input.caseId);
  if (!owned.ok) return owned.result;
  const row = owned.row;

  const program = await getVerificationProgramCore(supabase, userId);
  if (input.sizeBytes > program.maxFileBytes) {
    return {
      status: 400,
      message: `That file is too large. The limit is ${Math.round(
        program.maxFileBytes / (1024 * 1024),
      )} MB.`,
    };
  }

  const types = await loadEvidenceTypes(
    supabase,
    row.subject_type as VerificationSubjectType,
  );
  if (!types.some((t) => t.key === input.evidenceType)) {
    return { status: 400, message: "Choose a document type from the list." };
  }

  const { count } = await supabase
    .from("verification_evidence")
    .select("id", { count: "exact", head: true })
    .eq("case_id", input.caseId)
    .neq("status", "purged");
  if ((count ?? 0) >= program.maxEvidenceFiles) {
    return {
      status: 409,
      message: `You can attach at most ${program.maxEvidenceFiles} documents.`,
    };
  }

  const allowed = await checkRateLimit(
    `verification:upload:${userId}`,
    MAX_UPLOAD_TICKETS_PER_HOUR,
    3600,
  );
  if (!allowed) {
    return { status: 429, message: "Too many uploads. Try again later." };
  }

  const evidenceId = randomUUID();
  const subjectId = (row.subject_id ??
    row.place_id ??
    row.organizer_user_id) as string;
  const path = evidencePath(
    row.subject_type,
    subjectId,
    row.id,
    evidenceId,
    input.mimeType,
  );

  const { error: insErr } = await supabase
    .from("verification_evidence")
    .insert({
      id: evidenceId,
      case_id: input.caseId,
      evidence_type: input.evidenceType,
      storage_path: path,
      file_name: input.fileName ?? null,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      status: "pending_upload",
      uploaded_by: userId,
    } as never);
  if (insErr) {
    logger.error(`verification evidence insert failed: ${insErr.message}`);
    return { status: 500, message: "Could not prepare the upload. Try again." };
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(VERIFICATION_EVIDENCE_BUCKET)
    .createSignedUploadUrl(path);
  if (signErr || !signed) {
    await supabase.from("verification_evidence").delete().eq("id", evidenceId);
    logger.error(
      `verification signed upload failed: ${signErr?.message ?? "no url"}`,
    );
    return { status: 500, message: "Could not prepare the upload. Try again." };
  }

  return {
    status: 200,
    data: {
      evidenceId,
      bucket: VERIFICATION_EVIDENCE_BUCKET,
      path,
      token: signed.token,
    },
  };
}

export async function removeVerificationEvidenceCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { caseId: string; evidenceId: string },
): Promise<VerificationEnvelope> {
  const owned = await ownedEditableCase(supabase, userId, input.caseId);
  if (!owned.ok) return owned.result;

  const { data: ev } = await supabase
    .from("verification_evidence")
    .select("id, storage_path")
    .eq("id", input.evidenceId)
    .eq("case_id", input.caseId)
    .maybeSingle();
  if (!ev) return { status: 404, message: "Document not found" };

  await supabase.storage
    .from(VERIFICATION_EVIDENCE_BUCKET)
    .remove([ev.storage_path]);

  const { error } = await supabase
    .from("verification_evidence")
    .delete()
    .eq("id", ev.id);
  if (error) {
    logger.error(`removeVerificationEvidenceCore failed: ${error.message}`);
    return { status: 500, message: "Could not remove the document." };
  }

  await supabase.from("verification_event").insert({
    case_id: input.caseId,
    actor_id: userId,
    actor_kind: "user",
    event_type: "evidence_removed",
  } as never);

  return { status: 200, message: "Document removed." };
}

/**
 * Confirms the bytes actually landed, snapshots the subject, then hands the
 * state change to the RPC. Rows whose object never arrived are dropped
 * rather than counted, so "submitted" always means real evidence exists.
 */
export async function submitVerificationCaseCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { caseId: string },
): Promise<VerificationEnvelope> {
  if (isVerificationKillSwitchOn()) {
    return { status: 403, message: "Verification isn't available right now." };
  }

  const owned = await ownedEditableCase(supabase, userId, input.caseId);
  if (!owned.ok) return owned.result;
  const row = owned.row;
  const resubmit = row.status === "needs_info";

  const { data: pending } = await supabase
    .from("verification_evidence")
    .select("id, storage_path")
    .eq("case_id", input.caseId)
    .eq("status", "pending_upload");

  for (const ev of (pending ?? []) as { id: string; storage_path: string }[]) {
    const slash = ev.storage_path.lastIndexOf("/");
    const dir = ev.storage_path.slice(0, slash);
    const file = ev.storage_path.slice(slash + 1);
    const { data: listed } = await supabase.storage
      .from(VERIFICATION_EVIDENCE_BUCKET)
      .list(dir, { search: file, limit: 100 });
    const present = (listed ?? []).some((o) => o.name === file);
    if (present) {
      await supabase
        .from("verification_evidence")
        .update({
          status: "uploaded",
          uploaded_at: new Date().toISOString(),
        } as never)
        .eq("id", ev.id);
    } else {
      // The ticket was issued but the upload never completed.
      await supabase.from("verification_evidence").delete().eq("id", ev.id);
    }
  }

  const facts = await resolveSubject(supabase, userId, {
    subjectType: row.subject_type as VerificationSubjectType,
    subjectId: (row.subject_id ??
      row.place_id ??
      row.organizer_user_id) as string,
  });
  if (!facts) return { status: 404, message: "Not found" };
  if (!facts.eligible) {
    return { status: 409, message: facts.blockedReason ?? "Not eligible" };
  }

  // Snapshot what is being claimed, so a reviewer can see whether the listing
  // changed between submission and review.
  const snapshot = await buildSubjectSnapshot(supabase, row);
  if (snapshot) {
    await supabase
      .from("verification_case")
      .update({ subject_snapshot: snapshot } as never)
      .eq("id", row.id);
  }

  const { error } = await supabase.rpc(
    "verification_transition",
    transitionArgs({
      caseId: row.id,
      actorId: userId,
      actorKind: "user",
      action: resubmit ? "resubmit" : "submit",
      expectedStatus: row.status,
    }),
  );
  if (error) return transitionError(error);

  const copy = NOTIFICATION_COPY.submitted(facts.name ?? "your listing");
  await createNotificationCore(supabase, {
    userId,
    type: "verification_submitted",
    title: copy.title,
    body: copy.body,
    link: verificationLink(row),
    data: verificationNotificationData(row),
  });

  return {
    status: 200,
    message: "Sent for review. We'll let you know when it's been reviewed.",
  };
}

export async function withdrawVerificationCaseCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { caseId: string },
): Promise<VerificationEnvelope> {
  const { data, error } = await supabase
    .from("verification_case")
    .select(CASE_COLUMNS)
    .eq("id", input.caseId)
    .maybeSingle();
  if (error) {
    logger.error(`withdrawVerificationCaseCore read failed: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }
  if (!data || (data as CaseRow).requester_id !== userId) {
    return { status: 404, message: "Verification request not found" };
  }
  const row = data as CaseRow;

  const { error: rpcErr } = await supabase.rpc(
    "verification_transition",
    transitionArgs({
      caseId: row.id,
      actorId: userId,
      actorKind: "user",
      action: "withdraw",
      expectedStatus: row.status,
    }),
  );
  if (rpcErr) return transitionError(rpcErr);

  return { status: 200, message: "Request withdrawn." };
}

async function buildSubjectSnapshot(
  supabase: ServiceRoleClient,
  row: CaseRow,
): Promise<Record<string, unknown> | null> {
  if (row.subject_type === "place" && row.place_id) {
    const { data } = await supabase
      .from("place")
      .select("name, address, category_id, owner_id")
      .eq("id", row.place_id)
      .maybeSingle();
    return data ? (data as Record<string, unknown>) : null;
  }
  if (row.organizer_user_id) {
    const { data } = await supabase
      .from("user_info")
      .select("username, full_name")
      .eq("id", row.organizer_user_id)
      .maybeSingle();
    return data ? (data as Record<string, unknown>) : null;
  }
  return null;
}

/** Deep link for a verification notification. */
export function verificationLink(row: {
  subject_type: string;
  place_id: string | null;
}): string {
  return row.subject_type === "place" && row.place_id
    ? `/manage/places/${row.place_id}?tab=verification`
    : "/manage/verification";
}

export function verificationNotificationData(row: {
  subject_type: string;
  place_id: string | null;
}): NotificationData {
  return row.subject_type === "place" && row.place_id
    ? {
        kind: "verification",
        verificationSubject: "place",
        placeId: row.place_id,
      }
    : { kind: "verification", verificationSubject: "organizer" };
}
