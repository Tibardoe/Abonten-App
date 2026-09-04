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
  ClaimDetail,
  ClaimListItem,
  ClaimStatus,
} from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { SupabaseClient } from "@supabase/supabase-js";
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

const NOTE_TARGET = "place_claim";

async function resolveNames(
  supabase: SupabaseClient<Database>,
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
  cursor?: string | null;
  pageSize?: number;
};

export async function listClaimsCore(
  supabase: SupabaseClient<Database>,
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
  const cursor = decodeCursor<SimpleCursor>(filters.cursor);

  let query = supabase
    .from("place_claim_request")
    .select(
      "id, status, place_id, claimant_id, contact_email, contact_phone, created_at, reviewed_at, place(name, slug), place_claim_document(count)",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (!filters.status || filters.status !== "all") {
    query = query.eq("status", filters.status ?? "pending");
  }
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
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
    rows.map((r) => r.claimant_id as string),
  );

  const mapped: ClaimListItem[] = rows.map((r) => {
    const place = r.place as { name?: string; slug?: string } | null;
    const docEmbed = r.place_claim_document as { count: number }[] | undefined;
    return {
      id: r.id as string,
      status: r.status as ClaimStatus,
      placeId: r.place_id as string,
      placeName: place?.name ?? null,
      placeSlug: place?.slug ?? null,
      claimantId: r.claimant_id as string,
      claimantName: names.get(r.claimant_id as string) ?? null,
      documentCount: Array.isArray(docEmbed) ? (docEmbed[0]?.count ?? 0) : 0,
      contactEmail: canPii ? ((r.contact_email as string) ?? null) : null,
      contactPhone: canPii ? ((r.contact_phone as string) ?? null) : null,
      createdAt: r.created_at as string,
      reviewedAt: (r.reviewed_at as string) ?? null,
    };
  });

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

export async function getClaimDetailCore(
  supabase: SupabaseClient<Database>,
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
      .select("id, name, slug, status, owner_id, claimed, verified")
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
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  input: {
    claimId: string;
    decision: "approve" | "reject";
    reason?: string;
    expectedStatus?: ClaimStatus;
  },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "claims.review");
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

  if (input.decision === "approve") {
    const { error: rpcErr } = await supabase.rpc("approve_place_claim", {
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
      title: "Your claim was approved",
      body: `You now manage ${placeName}.`,
      link: `/manage/places/${claim.place_id}`,
    });
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
      title: "Your claim request was not approved",
      body: `Your request to claim ${placeName} was rejected.`,
      link: place?.slug ? `/places/${place.slug}` : null,
    });
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: `claim.${input.decision}`,
    targetType: "place_claim",
    targetId: input.claimId,
    summary: `${input.decision === "approve" ? "Approved" : "Rejected"} claim for ${placeName}`,
    reason: input.reason ?? null,
    before: { status: "pending" },
    after: {
      status: input.decision === "approve" ? "approved" : "rejected",
      place_id: claim.place_id,
      claimant_id: claim.claimant_id,
    },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message:
      input.decision === "approve"
        ? "Claim approved — ownership transferred."
        : "Claim rejected.",
  };
}
