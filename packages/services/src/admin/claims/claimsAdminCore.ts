import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type {
  AdminContext,
  AdminNoteEntry,
  ClaimCurrentOwner,
  ClaimDetail,
  ClaimListItem,
  ClaimSituation,
  ClaimStatus,
} from "@abonten/types/adminTypes";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { requireVerifiedIdentity } from "../../identity/identityCore";
import { createNotificationCore } from "../../notifications/createNotification";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Place-claim review, folded into the Admin Console (Phase 2). Replaces the
// standalone /admin/place-claims web page. Reuses the existing
// approve_place_claim RPC verbatim — the ONLY path that reassigns
// place.owner_id — passing the resolved human admin's id as p_admin_id
// (their user_info.is_admin is kept true by the admin_user sync trigger, so
// the RPC's own is_admin check passes even though this runs on the
// service-role client). Rejection is a guarded status update, mirroring the
// old reviewPlaceClaimRequest action. Every path is permission-checked,
// audited, optimistic-concurrency guarded, and notifies the claimant.
//
// Ownership disputes (2026-11-26, migration 20261126140000): a waiting
// claim on a place someone else runs, or on a place of the team the
// claimant is in, is a dispute. Where a claim stands is worked out when it
// is read (public.place_claim_situation), so a claim becomes a dispute the
// moment another claim on the same place is approved. The list puts
// disputes first; the detail names who runs the place now and since when;
// approving one needs the place's name typed (confirmPlaceName). Nobody is
// told when a dispute is filed: staff decide whether to contact the owner.

const NOTE_TARGET = "place_claim";

const SITUATIONS: readonly ClaimSituation[] = [
  "owner",
  "team_member",
  "owner_deleted",
  "listed_by_abonten",
  "dispute",
];

function asSituation(value: unknown): ClaimSituation | null {
  return SITUATIONS.includes(value as ClaimSituation)
    ? (value as ClaimSituation)
    : null;
}

/** Approving it takes the place from an account that runs it. */
export function situationIsDispute(situation: ClaimSituation | null): boolean {
  return situation === "dispute" || situation === "team_member";
}

/** Names compared the way a person types them: case and spacing aside. */
export function sameName(
  typed: string | null | undefined,
  name: string | null | undefined,
): boolean {
  const norm = (v: string | null | undefined) =>
    (v ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
  return norm(name) !== "" && norm(typed) === norm(name);
}

/** The list's cursor: the last row's place in the order. */
type ClaimsCursor = { rank: number; createdAt: string; id: string };

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

export type ListClaimsFilters = {
  status?: ClaimStatus | "all";
  /** Waiting ownership disputes only (the list's "Disputes" view). */
  disputesOnly?: boolean;
  cursor?: string | null;
  pageSize?: number;
};

export async function listClaimsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: ListClaimsFilters = {},
): Promise<PaginatedResult<ClaimListItem>> {
  try {
    assertPermission(ctx, "claims.view");
  } catch (e) {
    return {
      status: 403,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: (e as Error).message,
    };
  }

  const canPii = ctx.permissions.includes("users.view_pii");
  const pageSize = filters.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<ClaimsCursor>(filters.cursor);
  // Disputes are waiting claims by definition.
  const status = filters.disputesOnly
    ? "pending"
    : (filters.status ?? "pending");

  const { data, error } = await supabase.rpc("admin_place_claims_page", {
    p_status: status,
    p_disputes_only: !!filters.disputesOnly,
    p_after_rank: cursor ? Number(cursor.rank) || 0 : undefined,
    p_after_created: cursor?.createdAt,
    p_after_id: cursor?.id,
    p_limit: pageSize + 1,
  });
  if (error) {
    logger.error(`listClaimsCore failed: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  }

  const rows = data ?? [];
  const names = await resolveNames(
    supabase,
    rows.map((r) => r.claimant_id),
  );

  const ranked = rows.map((r) => {
    const situation = asSituation(r.situation);
    const item: ClaimListItem = {
      id: r.id,
      status: r.status as ClaimStatus,
      situation,
      isDispute: situationIsDispute(situation),
      placeId: r.place_id,
      placeName: r.place_name ?? null,
      placeSlug: r.place_slug ?? null,
      claimantId: r.claimant_id,
      claimantName: names.get(r.claimant_id) ?? null,
      documentCount: r.document_count ?? 0,
      contactEmail: canPii ? (r.contact_email ?? null) : null,
      contactPhone: canPii ? (r.contact_phone ?? null) : null,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at ?? null,
    };
    return { item, rank: r.sort_rank ?? 0 };
  });

  const { page, hasNextPage } = splitPage(ranked, pageSize);
  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<ClaimsCursor>({
          rank: last.rank,
          createdAt: last.item.createdAt,
          id: last.item.id,
        })
      : null;

  return {
    status: 200,
    data: page.map((p) => p.item),
    nextCursor,
    hasNextPage,
  };
}

/**
 * Who runs the place now: the account, a team's active Owners, and since
 * when it has had the place: an approved claim of its own, the team being
 * made from the person who held it (team_convert_account), or listing it.
 */
async function loadCurrentOwner(
  supabase: ServiceRoleClient,
  place: { id: string; owner_id: string; created_at: string | null },
): Promise<ClaimCurrentOwner | null> {
  const [{ data: owner }, { data: team }, { data: approved }] =
    await Promise.all([
      supabase
        .from("user_info")
        .select("id, full_name, username, status_id, account_kind")
        .eq("id", place.owner_id)
        .maybeSingle(),
      supabase
        .from("team")
        .select("status, created_at")
        .eq("account_id", place.owner_id)
        .maybeSingle(),
      supabase
        .from("place_claim_request")
        .select("reviewed_at")
        .eq("place_id", place.id)
        .eq("claimant_id", place.owner_id)
        .eq("status", "approved")
        .order("reviewed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  if (!owner) return null;

  const isTeam = owner.account_kind === "team" || !!team;
  let teamOwners: ClaimCurrentOwner["teamOwners"] = [];
  if (isTeam) {
    const { data: members } = await supabase
      .from("team_member")
      .select("user_id")
      .eq("team_id", place.owner_id)
      .eq("role", "owner")
      .eq("status", "active");
    const ids = (members ?? []).map((m) => m.user_id);
    if (ids.length > 0) {
      const { data: people } = await supabase
        .from("user_info")
        .select("id, full_name, username")
        .in("id", ids);
      teamOwners = (people ?? []).map((p) => ({
        id: p.id,
        name: p.full_name ?? null,
        username: p.username ?? null,
      }));
    }
  }

  let since: string | null = place.created_at;
  let sinceBasis: ClaimCurrentOwner["sinceBasis"] = "listed";
  if (approved?.reviewed_at) {
    since = approved.reviewed_at;
    sinceBasis = "claim_approved";
  } else if (
    team?.created_at &&
    place.created_at &&
    new Date(team.created_at).getTime() > new Date(place.created_at).getTime()
  ) {
    since = team.created_at;
    sinceBasis = "team_created";
  }

  return {
    id: owner.id,
    name: owner.full_name ?? null,
    username: owner.username ?? null,
    kind: isTeam ? "team" : "person",
    statusId: owner.status_id ?? null,
    teamStatus: team?.status ?? null,
    teamOwners,
    since,
    sinceBasis,
  };
}

export async function getClaimDetailCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  claimId: string,
  opts: { signDoc?: (path: string) => Promise<string | null> } = {},
): Promise<AdminEnvelope<ClaimDetail>> {
  try {
    assertPermission(ctx, "claims.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data: c, error } = await supabase
    .from("place_claim_request")
    .select("*")
    .eq("id", claimId)
    .maybeSingle();
  if (error) {
    logger.error(`getClaimDetailCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!c) return { status: 404, message: "Claim request not found" };

  const canPii = ctx.permissions.includes("users.view_pii");

  const [
    { data: place },
    { data: claimant },
    { data: docRows },
    { data: noteRows },
    { count: pendingElsewhere },
  ] = await Promise.all([
    supabase
      .from("place")
      .select("id, name, slug, status, owner_id, claimed, verified, created_at")
      .eq("id", c.place_id)
      .maybeSingle(),
    supabase
      .from("user_info")
      .select("id, username, full_name")
      .eq("id", c.claimant_id)
      .maybeSingle(),
    supabase
      .from("place_claim_document")
      .select("id, storage_path, file_name, mime_type, size_bytes")
      .eq("claim_request_id", claimId)
      .order("created_at", { ascending: true }),
    supabase
      .from("admin_note")
      .select("id, author_id, body, created_at")
      .eq("target_type", NOTE_TARGET)
      .eq("target_id", claimId)
      .order("created_at", { ascending: true }),
    supabase
      .from("place_claim_request")
      .select("id", { count: "exact", head: true })
      .eq("place_id", c.place_id)
      .eq("status", "pending"),
  ]);

  let claimantEmail: string | null = null;
  if (canPii) {
    const { data: authUser } = await supabase.auth.admin.getUserById(
      c.claimant_id,
    );
    claimantEmail = authUser?.user?.email ?? null;
  }

  const names = await resolveNames(supabase, [
    c.reviewed_by,
    ...(noteRows ?? []).map((n) => n.author_id),
  ]);

  const documents = await Promise.all(
    (docRows ?? []).map(async (d) => ({
      id: d.id,
      fileName: d.file_name,
      mimeType: d.mime_type,
      sizeBytes: d.size_bytes,
      url: opts.signDoc ? await opts.signDoc(d.storage_path) : null,
    })),
  );

  const notes: AdminNoteEntry[] = (noteRows ?? []).map((n) => ({
    id: n.id,
    authorId: n.author_id,
    authorName: n.author_id ? (names.get(n.author_id) ?? null) : null,
    body: n.body,
    createdAt: n.created_at,
  }));

  void pendingElsewhere; // reserved for a future "N pending on this place" hint

  // Where a waiting claim stands now, and whose place it would take. A
  // decided claim has neither.
  let situation: ClaimSituation | null = null;
  let currentOwner: ClaimCurrentOwner | null = null;
  if (c.status === "pending" && place) {
    const { data: found, error: situationError } = await supabase.rpc(
      "place_claim_situation",
      { p_place_id: c.place_id, p_claimant_id: c.claimant_id },
    );
    if (situationError) {
      logger.error(`getClaimDetailCore situation: ${situationError.message}`);
      return { status: 500, message: "Something went wrong" };
    }
    situation = asSituation(found);
    currentOwner = await loadCurrentOwner(supabase, {
      id: place.id,
      owner_id: place.owner_id,
      created_at: place.created_at ?? null,
    });
  }

  return {
    status: 200,
    data: {
      id: c.id,
      status: c.status as ClaimStatus,
      note: c.note ?? null,
      contactEmail: canPii ? (c.contact_email ?? null) : null,
      contactPhone: canPii ? (c.contact_phone ?? null) : null,
      createdAt: c.created_at,
      reviewedBy: c.reviewed_by ?? null,
      reviewedByName: c.reviewed_by ? (names.get(c.reviewed_by) ?? null) : null,
      reviewedAt: c.reviewed_at ?? null,
      place: {
        id: place?.id ?? c.place_id,
        name: place?.name ?? null,
        slug: place?.slug ?? null,
        status: place?.status ?? null,
        currentOwnerId: place?.owner_id ?? null,
        claimed: !!place?.claimed,
        verified: !!place?.verified,
      },
      situation,
      isDispute: situationIsDispute(situation),
      currentOwner,
      claimant: {
        id: c.claimant_id,
        username: claimant?.username ?? null,
        fullName: claimant?.full_name ?? null,
        email: claimantEmail,
      },
      documents,
      notes,
    },
  };
}

export async function reviewClaimCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    claimId: string;
    decision: "approve" | "reject";
    reason?: string;
    expectedStatus?: ClaimStatus;
    /**
     * "Approve and verify" — the reviewer judged the claim's documents good
     * enough to also verify the place. Runs as ONE transaction
     * (approve_place_claim_and_verify), so a claim can never end up approved
     * but unverified when the reviewer asked for both.
     */
    alsoVerify?: boolean;
    /**
     * Approving an ownership dispute takes the place from the account that
     * runs it, so the reviewer types the place's name to approve one.
     */
    confirmPlaceName?: string;
  },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "claims.review");
    // Verifying is a separate, more sensitive act than transferring
    // ownership, so it needs its own permission on top.
    if (input.alsoVerify && input.decision === "approve") {
      assertPermission(ctx, "verification.review");
    }
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data: claim, error: fetchErr } = await supabase
    .from("place_claim_request")
    .select("id, place_id, claimant_id, status, place(name, slug)")
    .eq("id", input.claimId)
    .maybeSingle();
  if (fetchErr) {
    logger.error(`reviewClaimCore fetch failed: ${fetchErr.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!claim) return { status: 404, message: "Claim request not found" };
  if (claim.status !== "pending") {
    return { status: 409, message: "This claim has already been reviewed." };
  }
  if (input.expectedStatus && claim.status !== input.expectedStatus) {
    return {
      status: 409,
      message: "This claim changed since you opened it. Reload.",
    };
  }

  const place = claim.place as { name?: string; slug?: string } | null;
  const placeName = place?.name ?? "the place";

  const verifyToo = !!input.alsoVerify && input.decision === "approve";

  // Whether approving takes the place from an account that runs it, and
  // whose it is now (for the audit entry).
  const [{ data: situationValue, error: situationError }, { data: owned }] =
    await Promise.all([
      supabase.rpc("place_claim_situation", {
        p_place_id: claim.place_id,
        p_claimant_id: claim.claimant_id,
      }),
      supabase
        .from("place")
        .select("owner_id")
        .eq("id", claim.place_id)
        .maybeSingle(),
    ]);
  if (situationError) {
    logger.error(`reviewClaimCore situation: ${situationError.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  const situation = asSituation(situationValue);
  const dispute = situationIsDispute(situation);
  const previousOwnerId = (owned?.owner_id as string | undefined) ?? null;

  if (input.decision === "approve") {
    if (dispute && !sameName(input.confirmPlaceName, place?.name)) {
      return {
        status: 400,
        message:
          "This is an ownership dispute: type the place's name exactly to approve it.",
      };
    }
    // The person taking over a listing must be traceable, when required.
    const identityGate = await requireVerifiedIdentity(
      supabase,
      claim.claimant_id,
      "place_claims",
    );
    if (identityGate) {
      return {
        status: 409,
        message:
          "The claimant has not verified their identity, which is required before a claim is approved. Ask them to verify under Settings › Identity.",
      };
    }
    if (
      verifyToo &&
      (await requireVerifiedIdentity(
        supabase,
        claim.claimant_id,
        "verified_badges",
      ))
    ) {
      return {
        status: 409,
        message:
          "The claimant has not verified their identity, which is required before a Verified badge. Approve the claim without verifying, or ask them to verify first.",
      };
    }
    // Since 2026-09-12 approve_place_claim transfers ownership ONLY — the
    // verified badge is its own reviewed lifecycle (PROJECT.md §30). The
    // reviewer opts into verifying with alsoVerify, which runs both in one
    // transaction.
    const { error: rpcErr } = verifyToo
      ? await supabase.rpc("approve_place_claim_and_verify", {
          p_request_id: input.claimId,
          p_admin_id: ctx.userId,
        })
      : await supabase.rpc("approve_place_claim", {
          p_request_id: input.claimId,
          p_admin_id: ctx.userId,
        });
    if (rpcErr) {
      logger.error(`approve_place_claim failed: ${rpcErr.message}`);
      const notAuthorized = rpcErr.message?.includes("Not authorized");
      return {
        status: notAuthorized ? 403 : 409,
        message: notAuthorized
          ? "Not authorized"
          : "This claim could not be approved — it may have already been reviewed.",
      };
    }
    await createNotificationCore(supabase, {
      userId: claim.claimant_id,
      type: "place_claim_approved",
      notice: {
        id: "place_claim_approved",
        params: { place: place?.name ?? null },
      },
      link: `/manage/places/${claim.place_id}`,
    });
    if (verifyToo) {
      await createNotificationCore(supabase, {
        userId: claim.claimant_id,
        type: "verification_approved",
        notice: {
          id: "verification_approved",
          params: { subject: place?.name ?? null, subjectKind: "place" },
        },
        link: `/manage/places/${claim.place_id}?tab=verification`,
        data: {
          kind: "verification",
          verificationSubject: "place",
          placeId: claim.place_id as string,
        },
      });
    }
  } else {
    const { data: updated, error: updErr } = await supabase
      .from("place_claim_request")
      .update({
        status: "rejected",
        reviewed_by: ctx.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", input.claimId)
      .eq("status", "pending")
      .select("id");
    if (updErr) {
      logger.error(`reviewClaimCore reject failed: ${updErr.message}`);
      return { status: 500, message: "Something went wrong" };
    }
    if (!updated || updated.length === 0) {
      return { status: 409, message: "This claim has already been reviewed." };
    }
    await createNotificationCore(supabase, {
      userId: claim.claimant_id,
      type: "place_claim_rejected",
      notice: {
        id: "place_claim_rejected",
        params: { place: place?.name ?? null },
      },
      link: place?.slug ? `/places/${place.slug}` : null,
    });
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: verifyToo ? "claim.approve_and_verify" : `claim.${input.decision}`,
    targetType: "place_claim",
    targetId: input.claimId,
    summary: `${
      input.decision === "approve"
        ? verifyToo
          ? "Approved and verified"
          : "Approved"
        : "Rejected"
    } ${dispute ? "ownership dispute" : "claim"} for ${placeName}`,
    reason: input.reason ?? null,
    before: {
      status: "pending",
      situation,
      owner_id: previousOwnerId,
    },
    after: {
      status: input.decision === "approve" ? "approved" : "rejected",
      verified: verifyToo,
      place_id: claim.place_id,
      claimant_id: claim.claimant_id,
      dispute,
    },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message:
      input.decision === "approve"
        ? verifyToo
          ? "Claim approved — ownership transferred and the place verified."
          : "Claim approved — ownership transferred."
        : "Claim rejected.",
  };
}
