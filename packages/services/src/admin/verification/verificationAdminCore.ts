import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import { NOTIFICATION_COPY } from "@abonten/core/verification/copy";
import type {
  AdminContext,
  AdminNoteEntry,
  VerificationCaseDetail,
  VerificationEvidenceView,
  VerificationListItem,
  VerificationOverviewCounts,
  VerificationTimelineEntry,
} from "@abonten/types/adminTypes";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  OrganizerType,
  VerificationStatus,
  VerificationSubjectType,
} from "@abonten/types/verificationType";
import { createNotificationCore } from "../../notifications/createNotification";
import {
  verificationLink,
  verificationNotificationData,
} from "../../verification/verificationCaseCore";
import {
  CASE_COLUMNS,
  type CaseRow,
  EVENT_COLUMNS,
  EVIDENCE_COLUMNS,
  type EventRow,
  type EvidenceRow,
  type VerificationEnvelope,
  evidenceTypeLabels,
  transitionArgs,
  transitionError,
} from "../../verification/verificationRows";
import {
  type AdminEnvelope,
  assertPermission,
  hasPermission,
  recordAdminAudit,
} from "../adminContext";

// Trust & Verification review (PROJECT.md §30), folded into the Admin
// Console alongside Claims and Reports. Every decision goes through the
// verification_transition RPC, so two reviewers acting at once, or a place
// that changed hands since submission, are settled by the database rather
// than by whoever's request lands first.
//
// Four permissions, deliberately separate:
//   verification.view      the queue and the metadata
//   verification.evidence  opening the documents themselves
//   verification.review    approve / reject / request more information
//   verification.revoke    removing a badge after approval (step-up)

const NOTE_TARGET = "verification_case";

async function resolveNames(
  supabase: ServiceRoleClient,
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase
    .from("user_info")
    .select("id, full_name, username")
    .in("id", unique);
  const map = new Map<string, string>();
  for (const r of data ?? [])
    map.set(r.id, r.full_name || r.username || r.id.slice(0, 8));
  return map;
}

/** Place names / slugs and organizer display names for a batch of cases. */
async function resolveSubjects(
  supabase: ServiceRoleClient,
  rows: CaseRow[],
): Promise<Map<string, { name: string | null; slug: string | null }>> {
  const out = new Map<string, { name: string | null; slug: string | null }>();
  const placeIds = rows
    .filter((r) => r.subject_type === "place" && r.place_id)
    .map((r) => r.place_id as string);
  const userIds = rows
    .filter((r) => r.subject_type === "organizer" && r.organizer_user_id)
    .map((r) => r.organizer_user_id as string);

  const [places, users] = await Promise.all([
    placeIds.length
      ? supabase.from("place").select("id, name, slug").in("id", placeIds)
      : Promise.resolve({
          data: [] as { id: string; name: string; slug: string }[],
        }),
    userIds.length
      ? supabase
          .from("user_info")
          .select("id, full_name, username")
          .in("id", userIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            full_name: string | null;
            username: string | null;
          }[],
        }),
  ]);

  for (const p of (places.data ?? []) as {
    id: string;
    name: string;
    slug: string;
  }[]) {
    out.set(p.id, { name: p.name, slug: p.slug });
  }
  for (const u of (users.data ?? []) as {
    id: string;
    full_name: string | null;
    username: string | null;
  }[]) {
    out.set(u.id, { name: u.full_name || u.username, slug: null });
  }
  return out;
}

function toListItem(
  row: CaseRow,
  subjects: Map<string, { name: string | null; slug: string | null }>,
  names: Map<string, string>,
  evidenceCounts: Map<string, number>,
): VerificationListItem {
  const subjectId = (row.subject_id ??
    row.place_id ??
    row.organizer_user_id) as string;
  const subject = subjects.get(subjectId);
  return {
    id: row.id,
    subjectType: row.subject_type as VerificationSubjectType,
    subjectId,
    subjectName: subject?.name ?? null,
    subjectSlug: subject?.slug ?? null,
    status: row.status as VerificationStatus,
    organizerType: (row.organizer_type as OrganizerType | null) ?? null,
    requesterId: row.requester_id,
    requesterName: names.get(row.requester_id) ?? null,
    evidenceCount: evidenceCounts.get(row.id) ?? 0,
    source: row.source,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
  };
}

async function countEvidence(
  supabase: ServiceRoleClient,
  caseIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (caseIds.length === 0) return out;
  const { data } = await supabase
    .from("verification_evidence")
    .select("case_id")
    .in("case_id", caseIds)
    .neq("status", "purged");
  for (const r of (data ?? []) as { case_id: string }[]) {
    out.set(r.case_id, (out.get(r.case_id) ?? 0) + 1);
  }
  return out;
}

export type ListVerificationFilters = {
  status?: VerificationStatus | "all";
  subjectType?: VerificationSubjectType | "all";
  cursor?: string | null;
  pageSize?: number;
};

export async function listVerificationCasesCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: ListVerificationFilters = {},
): Promise<PaginatedResult<VerificationListItem>> {
  try {
    assertPermission(ctx, "verification.view");
  } catch (e) {
    return {
      status: 403,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: (e as Error).message,
    };
  }

  const pageSize = filters.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(filters.cursor);

  let query = supabase
    .from("verification_case")
    .select(CASE_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (!filters.status || filters.status !== "all") {
    query = query.eq("status", filters.status ?? "pending_review");
  }
  if (filters.subjectType && filters.subjectType !== "all") {
    query = query.eq("subject_type", filters.subjectType);
  }
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    logger.error(`listVerificationCasesCore failed: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  }

  const rows = (data ?? []) as CaseRow[];
  const [subjects, names, evidenceCounts] = await Promise.all([
    resolveSubjects(supabase, rows),
    resolveNames(
      supabase,
      rows.map((r) => r.requester_id),
    ),
    countEvidence(
      supabase,
      rows.map((r) => r.id),
    ),
  ]);

  const mapped = rows.map((r) =>
    toListItem(r, subjects, names, evidenceCounts),
  );
  const { page, hasNextPage } = splitPage(mapped, pageSize);
  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.createdAt),
          id: last.id,
        })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}

export async function getVerificationCaseDetailCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  caseId: string,
  opts: { signDoc?: (path: string) => Promise<string | null> } = {},
): Promise<AdminEnvelope<VerificationCaseDetail>> {
  try {
    assertPermission(ctx, "verification.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data: c, error } = await supabase
    .from("verification_case")
    .select(CASE_COLUMNS)
    .eq("id", caseId)
    .maybeSingle();
  if (error) {
    logger.error(`getVerificationCaseDetailCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!c) return { status: 404, message: "Verification request not found" };

  const row = c as CaseRow;
  const canPii = hasPermission(ctx, "users.view_pii");
  // Documents are the sensitive part: a reviewer without verification.evidence
  // sees that they exist and what type they are, never a link to open them.
  const canOpenEvidence = hasPermission(ctx, "verification.evidence");
  const subjectId = (row.subject_id ??
    row.place_id ??
    row.organizer_user_id) as string;

  const [
    { data: evidenceRows },
    { data: eventRows },
    { data: noteRows },
    { data: requester },
    { data: priorRows },
    labels,
  ] = await Promise.all([
    supabase
      .from("verification_evidence")
      .select(EVIDENCE_COLUMNS)
      .eq("case_id", caseId)
      .order("created_at", { ascending: true }),
    supabase
      .from("verification_event")
      .select(EVENT_COLUMNS)
      .eq("case_id", caseId)
      .order("created_at", { ascending: true }),
    supabase
      .from("admin_note")
      .select("id, author_id, body, created_at")
      .eq("target_type", NOTE_TARGET)
      .eq("target_id", caseId)
      .order("created_at", { ascending: true }),
    supabase
      .from("user_info")
      .select("id, username, full_name, status_id")
      .eq("id", row.requester_id)
      .maybeSingle(),
    supabase
      .from("verification_case")
      .select(CASE_COLUMNS)
      .eq("subject_type", row.subject_type)
      .eq("subject_id", subjectId)
      .neq("id", caseId)
      .order("created_at", { ascending: false })
      .limit(10),
    evidenceTypeLabels(supabase),
  ]);

  const subject = await loadSubjectDetail(supabase, row, subjectId);

  let requesterEmail: string | null = null;
  if (canPii) {
    const { data: authUser } = await supabase.auth.admin.getUserById(
      row.requester_id,
    );
    requesterEmail = authUser?.user?.email ?? null;
  }

  const actorNames = await resolveNames(supabase, [
    row.reviewed_by,
    row.revoked_by,
    ...((eventRows ?? []) as EventRow[]).map((e) => e.actor_id),
    ...(noteRows ?? []).map((n) => n.author_id),
  ]);

  const evidence: VerificationEvidenceView[] = await Promise.all(
    ((evidenceRows ?? []) as EvidenceRow[]).map(async (e) => ({
      id: e.id,
      evidenceType: e.evidence_type,
      evidenceTypeLabel: labels.get(e.evidence_type) ?? null,
      fileName: e.file_name,
      mimeType: e.mime_type,
      sizeBytes: e.size_bytes,
      status: e.status,
      createdAt: e.created_at,
      url:
        canOpenEvidence && opts.signDoc && e.status === "uploaded"
          ? await opts.signDoc(e.storage_path)
          : null,
    })),
  );

  const timeline: VerificationTimelineEntry[] = (
    (eventRows ?? []) as EventRow[]
  ).map((e) => ({
    id: e.id,
    eventType: e.event_type,
    actorKind: e.actor_kind,
    actorId: e.actor_id,
    actorName: e.actor_id ? (actorNames.get(e.actor_id) ?? null) : null,
    fromStatus: e.from_status,
    toStatus: e.to_status,
    reason: e.reason,
    meta: (e.meta as Record<string, unknown> | null) ?? null,
    createdAt: e.created_at,
  }));

  const notes: AdminNoteEntry[] = (noteRows ?? []).map((n) => ({
    id: n.id,
    authorId: n.author_id,
    authorName: n.author_id ? (actorNames.get(n.author_id) ?? null) : null,
    body: n.body,
    createdAt: n.created_at,
  }));

  const priors = (priorRows ?? []) as CaseRow[];
  const priorSubjects = await resolveSubjects(supabase, priors);
  const priorNames = await resolveNames(
    supabase,
    priors.map((p) => p.requester_id),
  );
  const priorCounts = await countEvidence(
    supabase,
    priors.map((p) => p.id),
  );

  return {
    status: 200,
    data: {
      id: row.id,
      subjectType: row.subject_type as VerificationSubjectType,
      status: row.status as VerificationStatus,
      organizerType: (row.organizer_type as OrganizerType | null) ?? null,
      legalName: row.legal_name,
      applicantNote: row.applicant_note,
      contactEmail: canPii ? row.contact_email : null,
      contactPhone: canPii ? row.contact_phone : null,
      decisionReason: row.decision_reason,
      source: row.source,
      claimRequestId: row.claim_request_id,
      createdAt: row.created_at,
      submittedAt: row.submitted_at,
      reviewedBy: row.reviewed_by,
      reviewedByName: row.reviewed_by
        ? (actorNames.get(row.reviewed_by) ?? null)
        : null,
      reviewedAt: row.reviewed_at,
      revokedByName: row.revoked_by
        ? (actorNames.get(row.revoked_by) ?? null)
        : null,
      revokedAt: row.revoked_at,
      subject,
      requester: {
        id: row.requester_id,
        username: requester?.username ?? null,
        fullName: requester?.full_name ?? null,
        email: requesterEmail,
        accountStatus: accountStatusName(requester?.status_id ?? null),
      },
      evidence,
      canOpenEvidence,
      timeline,
      notes,
      priorCases: priors.map((p) =>
        toListItem(p, priorSubjects, priorNames, priorCounts),
      ),
    },
  };
}

function accountStatusName(statusId: number | null): string | null {
  if (statusId === 1) return "Active";
  if (statusId === 2) return "Suspended";
  if (statusId === 3) return "Banned";
  return null;
}

async function loadSubjectDetail(
  supabase: ServiceRoleClient,
  row: CaseRow,
  subjectId: string,
): Promise<VerificationCaseDetail["subject"]> {
  const snapshot = (row.subject_snapshot ?? null) as Record<
    string,
    unknown
  > | null;

  const { count: openReportCount } = await supabase
    .from("report")
    .select("id", { count: "exact", head: true })
    .eq("target_type", row.subject_type === "place" ? "place" : "organizer")
    .eq("target_id", subjectId)
    .in("status", ["new", "under_review", "awaiting_info", "escalated"]);

  if (row.subject_type === "place") {
    const { data: place } = await supabase
      .from("place")
      .select("id, name, slug, status, moderation_state, owner_id, verified")
      .eq("id", subjectId)
      .maybeSingle();
    const snapshotOwner = snapshot?.owner_id as string | undefined;
    return {
      id: subjectId,
      name: place?.name ?? null,
      slug: place?.slug ?? null,
      status: place?.status ?? null,
      moderationState: place?.moderation_state ?? null,
      currentOwnerId: place?.owner_id ?? null,
      verified: !!place?.verified,
      // A place that changed hands after the request was filed must not be
      // verified for the old owner — the RPC refuses it, and this flag tells
      // the reviewer why before they try.
      ownerChangedSinceSubmission:
        !!place?.owner_id && place.owner_id !== row.requester_id,
      openReportCount: openReportCount ?? 0,
      ...(snapshotOwner ? {} : {}),
    };
  }

  const { data: user } = await supabase
    .from("user_info")
    .select("id, username, full_name, status_id, organizer_verified")
    .eq("id", subjectId)
    .maybeSingle();
  return {
    id: subjectId,
    name: user?.full_name || user?.username || null,
    slug: user?.username ?? null,
    status: accountStatusName(user?.status_id ?? null),
    moderationState: null,
    currentOwnerId: subjectId,
    verified: !!user?.organizer_verified,
    ownerChangedSinceSubmission: false,
    openReportCount: openReportCount ?? 0,
  };
}

export async function decideVerificationCaseCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    caseId: string;
    decision: "approve" | "reject" | "request_info";
    reason?: string;
    expectedStatus?: VerificationStatus;
  },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "verification.review");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  if (input.decision !== "approve" && !input.reason?.trim()) {
    return {
      status: 400,
      message: "A reason is required — the applicant is shown it.",
    };
  }

  const { data, error } = await supabase
    .from("verification_case")
    .select(CASE_COLUMNS)
    .eq("id", input.caseId)
    .maybeSingle();
  if (error) {
    logger.error(`decideVerificationCaseCore read failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!data) return { status: 404, message: "Verification request not found" };
  const row = data as CaseRow;
  const before = row.status;

  const { error: rpcErr } = await supabase.rpc(
    "verification_transition",
    transitionArgs({
      caseId: row.id,
      actorId: ctx.userId,
      actorKind: "admin",
      action: input.decision,
      reason: input.reason,
      expectedStatus: input.expectedStatus ?? before,
    }),
  );
  if (rpcErr) return transitionError(rpcErr, "Something went wrong");

  const subjectName = await subjectDisplayName(supabase, row);
  const reason = input.reason?.trim() ?? "";
  const copy =
    input.decision === "approve"
      ? NOTIFICATION_COPY.approved(subjectName)
      : input.decision === "request_info"
        ? NOTIFICATION_COPY.infoRequested(subjectName, reason)
        : NOTIFICATION_COPY.rejected(subjectName, reason);

  await createNotificationCore(supabase, {
    userId: row.requester_id,
    type:
      input.decision === "approve"
        ? "verification_approved"
        : input.decision === "request_info"
          ? "verification_info_requested"
          : "verification_rejected",
    title: copy.title,
    body: copy.body,
    link: verificationLink(row),
    data: verificationNotificationData(row),
  });

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: `verification.${input.decision}`,
    targetType: NOTE_TARGET,
    targetId: row.id,
    summary: `${
      input.decision === "approve"
        ? "Approved"
        : input.decision === "reject"
          ? "Rejected"
          : "Requested more information for"
    } ${row.subject_type} verification of ${subjectName}`,
    reason: input.reason?.trim() ?? null,
    before: { status: before },
    after: {
      decision: input.decision,
      subject_type: row.subject_type,
      subject_id: row.subject_id,
      requester_id: row.requester_id,
    },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message:
      input.decision === "approve"
        ? "Approved — the badge is live."
        : input.decision === "request_info"
          ? "Sent back to the applicant for more information."
          : "Rejected.",
  };
}

export async function revokeVerificationCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { caseId: string; reason: string },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "verification.revoke");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  if (!input.reason?.trim()) {
    return { status: 400, message: "A reason is required." };
  }

  const { data, error } = await supabase
    .from("verification_case")
    .select(CASE_COLUMNS)
    .eq("id", input.caseId)
    .maybeSingle();
  if (error) {
    logger.error(`revokeVerificationCore read failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!data) return { status: 404, message: "Verification request not found" };
  const row = data as CaseRow;

  const { error: rpcErr } = await supabase.rpc(
    "verification_transition",
    transitionArgs({
      caseId: row.id,
      actorId: ctx.userId,
      actorKind: "admin",
      action: "revoke",
      reason: input.reason,
      expectedStatus: "approved",
    }),
  );
  if (rpcErr) return transitionError(rpcErr, "Something went wrong");

  const subjectName = await subjectDisplayName(supabase, row);
  const copy = NOTIFICATION_COPY.revoked(subjectName, input.reason.trim());
  await createNotificationCore(supabase, {
    userId: row.requester_id,
    type: "verification_revoked",
    title: copy.title,
    body: copy.body,
    link: verificationLink(row),
    data: verificationNotificationData(row),
  });

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "verification.revoke",
    targetType: NOTE_TARGET,
    targetId: row.id,
    summary: `Revoked ${row.subject_type} verification of ${subjectName}`,
    reason: input.reason.trim(),
    before: { status: "approved" },
    after: {
      status: "revoked",
      subject_type: row.subject_type,
      subject_id: row.subject_id,
    },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return { status: 200, message: "Verification revoked." };
}

async function subjectDisplayName(
  supabase: ServiceRoleClient,
  row: CaseRow,
): Promise<string> {
  if (row.subject_type === "place" && row.place_id) {
    const { data } = await supabase
      .from("place")
      .select("name")
      .eq("id", row.place_id)
      .maybeSingle();
    return data?.name ?? "your place";
  }
  if (row.organizer_user_id) {
    const { data } = await supabase
      .from("user_info")
      .select("full_name, username")
      .eq("id", row.organizer_user_id)
      .maybeSingle();
    return data?.full_name || data?.username || "your organizer profile";
  }
  return "your listing";
}

export async function addVerificationNoteCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { caseId: string; body: string },
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "verification.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  const { error } = await supabase.from("admin_note").insert({
    author_id: ctx.userId,
    target_type: NOTE_TARGET,
    target_id: input.caseId,
    body: input.body.trim(),
  } as never);
  if (error) {
    logger.error(`addVerificationNoteCore failed: ${error.message}`);
    return { status: 500, message: "Could not save the note" };
  }
  return { status: 200, message: "Note added." };
}

export async function verificationOverviewCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<AdminEnvelope<VerificationOverviewCounts>> {
  try {
    assertPermission(ctx, "verification.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const count = async (status: string, subjectType?: string) => {
    let q = supabase
      .from("verification_case")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    if (subjectType) q = q.eq("subject_type", subjectType);
    const { count: n } = await q;
    return n ?? 0;
  };

  const [
    pendingPlaces,
    pendingOrganizers,
    needsInfo,
    approvedPlaces,
    approvedOrganizers,
  ] = await Promise.all([
    count("pending_review", "place"),
    count("pending_review", "organizer"),
    count("needs_info"),
    count("approved", "place"),
    count("approved", "organizer"),
  ]);

  return {
    status: 200,
    data: {
      pendingPlaces,
      pendingOrganizers,
      needsInfo,
      approvedPlaces,
      approvedOrganizers,
    },
  };
}
