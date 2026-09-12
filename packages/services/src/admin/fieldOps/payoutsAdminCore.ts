import { maskAccountNumber } from "@abonten/core/maskAccountNumber";
import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  FieldOpsPayoutBatch,
  FieldOpsPayoutBatchDetail,
  FieldOpsPayoutItem,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";
import { type RequestMeta, dbError, denied, num } from "./fieldOpsAdminShared";

// Admin > Field Ops > Payouts. Money leaves the business here, so every
// step is a SQL function on the service role: the amounts are summed from
// the ledger (never sent by a client), a different admin has to approve
// what was built (enforced by a DB CHECK, not by this code), and each
// transfer's reference is recorded against its own item.

type BatchRow = {
  id: string;
  campaign_id: string;
  label: string;
  currency: string;
  status: string;
  total_minor: number | string;
  item_count: number;
  payment_method: string;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_by: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  fieldops_campaign?: { name: string } | null;
};

const BATCH_COLUMNS =
  "id, campaign_id, label, currency, status, total_minor, item_count, payment_method, created_by, approved_by, approved_at, paid_by, paid_at, cancelled_at, cancel_reason, notes, created_at, updated_at, fieldops_campaign(name)";

function mapBatch(r: BatchRow): FieldOpsPayoutBatch {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    campaignName: r.fieldops_campaign?.name ?? "",
    label: r.label,
    currency: r.currency,
    status: r.status as FieldOpsPayoutBatch["status"],
    totalMinor: num(r.total_minor),
    itemCount: num(r.item_count),
    paymentMethod: r.payment_method as FieldOpsPayoutBatch["paymentMethod"],
    createdBy: r.created_by,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    paidAt: r.paid_at,
    cancelledAt: r.cancelled_at,
    cancelReason: r.cancel_reason,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

type ItemRow = {
  id: string;
  batch_id: string;
  member_id: string;
  member_user_id: string;
  amount_minor: number | string;
  currency: string;
  commission_count: number;
  destination_snapshot: unknown;
  status: string;
  payment_reference: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  created_at: string;
  fieldops_team_member?: {
    full_name_snapshot: string | null;
    payout_momo_number: string | null;
    payout_momo_network: string | null;
    payout_holder_name: string | null;
  } | null;
};

const ITEM_COLUMNS =
  "id, batch_id, member_id, member_user_id, amount_minor, currency, commission_count, destination_snapshot, status, payment_reference, failure_reason, paid_at, created_at, fieldops_team_member(full_name_snapshot, payout_momo_number, payout_momo_network, payout_holder_name)";

/**
 * The destination is masked for everyone; the full MoMo number is only
 * revealed to an admin who holds users.view_pii, and even then it is read
 * live from the member row rather than from the batch snapshot.
 */
function mapItem(r: ItemRow, revealNumber: boolean): FieldOpsPayoutItem {
  const m = r.fieldops_team_member;
  const snapshot = (r.destination_snapshot ?? {}) as {
    network?: string;
    holderName?: string;
    numberMasked?: string;
  };
  const number = m?.payout_momo_number ?? null;
  return {
    id: r.id,
    batchId: r.batch_id,
    memberId: r.member_id,
    memberUserId: r.member_user_id,
    memberName: m?.full_name_snapshot ?? null,
    amountMinor: num(r.amount_minor),
    currency: r.currency,
    commissionCount: num(r.commission_count),
    destination: {
      network: m?.payout_momo_network ?? snapshot.network ?? null,
      holderName: m?.payout_holder_name ?? snapshot.holderName ?? null,
      numberMasked: number
        ? maskAccountNumber(number)
        : (snapshot.numberMasked ?? null),
      number: revealNumber ? number : null,
    },
    status: r.status as FieldOpsPayoutItem["status"],
    paymentReference: r.payment_reference,
    failureReason: r.failure_reason,
    paidAt: r.paid_at,
    createdAt: r.created_at,
  };
}

export async function listPayoutBatchesCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: { campaignId?: string; status?: string },
): Promise<AdminEnvelope<FieldOpsPayoutBatch[]>> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  let q = supabase
    .from("fieldops_payout_batch")
    .select(BATCH_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100);
  if (filters.campaignId) q = q.eq("campaign_id", filters.campaignId);
  if (filters.status) q = q.eq("status", filters.status);
  const { data, error } = await q;
  if (error) return dbError(error, "Could not load payout batches");
  return {
    status: 200,
    data: ((data ?? []) as unknown as BatchRow[]).map(mapBatch),
  };
}

export async function getPayoutBatchCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  batchId: string,
): Promise<AdminEnvelope<FieldOpsPayoutBatchDetail>> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  const [{ data: batch }, { data: items }] = await Promise.all([
    supabase
      .from("fieldops_payout_batch")
      .select(BATCH_COLUMNS)
      .eq("id", batchId)
      .maybeSingle(),
    supabase
      .from("fieldops_payout_item")
      .select(ITEM_COLUMNS)
      .eq("batch_id", batchId)
      .order("amount_minor", { ascending: false }),
  ]);
  const row = batch as unknown as BatchRow | null;
  if (!row) return { status: 404, message: "Batch not found" };
  const reveal = ctx.permissions.includes("users.view_pii");
  return {
    status: 200,
    data: {
      batch: mapBatch(row),
      items: ((items ?? []) as unknown as ItemRow[]).map((i) =>
        mapItem(i, reveal),
      ),
      /** Only a different admin may approve, so the UI can say so up front. */
      canApprove: row.status === "draft" && row.created_by !== ctx.userId,
    },
  };
}

/**
 * What the next batch would contain, so an admin can see the shape of it
 * (and who is missing a payout number) before creating anything.
 */
export async function previewPayoutBatchCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  campaignId: string,
): Promise<
  AdminEnvelope<{
    lines: {
      memberId: string;
      memberName: string | null;
      amountMinor: number;
      commissionCount: number;
      destinationMasked: string | null;
    }[];
    totalMinor: number;
    currency: string;
    withoutDestination: { memberName: string | null; amountMinor: number }[];
    openBatchId: string | null;
  }>
> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  const [{ data: rows, error }, { data: campaign }, { data: open }] =
    await Promise.all([
      supabase
        .from("fieldops_commission")
        .select(
          "member_id, amount_minor, currency, fieldops_team_member(full_name_snapshot, payout_momo_number, payout_momo_network)",
        )
        .eq("campaign_id", campaignId)
        .eq("status", "approved")
        .gt("amount_minor", 0),
      supabase
        .from("fieldops_campaign")
        .select("currency")
        .eq("id", campaignId)
        .maybeSingle(),
      supabase
        .from("fieldops_payout_batch")
        .select("id")
        .eq("campaign_id", campaignId)
        .in("status", ["draft", "approved"])
        .maybeSingle(),
    ]);
  if (error) return dbError(error, "Could not preview the batch");

  type Agg = {
    memberId: string;
    memberName: string | null;
    amountMinor: number;
    commissionCount: number;
    destinationMasked: string | null;
    hasDestination: boolean;
  };
  const byMember = new Map<string, Agg>();
  for (const r of (rows ?? []) as unknown as {
    member_id: string;
    amount_minor: number | string;
    fieldops_team_member: {
      full_name_snapshot: string | null;
      payout_momo_number: string | null;
      payout_momo_network: string | null;
    } | null;
  }[]) {
    const m = r.fieldops_team_member;
    const existing = byMember.get(r.member_id) ?? {
      memberId: r.member_id,
      memberName: m?.full_name_snapshot ?? null,
      amountMinor: 0,
      commissionCount: 0,
      destinationMasked: m?.payout_momo_number
        ? `${m.payout_momo_network ?? "MoMo"} ${maskAccountNumber(m.payout_momo_number)}`
        : null,
      hasDestination: Boolean(m?.payout_momo_number),
    };
    existing.amountMinor += num(r.amount_minor);
    existing.commissionCount += 1;
    byMember.set(r.member_id, existing);
  }
  const all = [...byMember.values()].sort(
    (a, b) => b.amountMinor - a.amountMinor,
  );
  const lines = all.filter((a) => a.hasDestination);
  return {
    status: 200,
    data: {
      lines: lines.map(({ hasDestination: _drop, ...rest }) => rest),
      totalMinor: lines.reduce((t, l) => t + l.amountMinor, 0),
      currency: campaign?.currency ?? "GHS",
      withoutDestination: all
        .filter((a) => !a.hasDestination)
        .map((a) => ({ memberName: a.memberName, amountMinor: a.amountMinor })),
      openBatchId: open?.id ?? null,
    },
  };
}

export async function buildPayoutBatchCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { campaignId: string; label: string; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<FieldOpsPayoutBatch>> {
  try {
    assertPermission(ctx, "fieldops.commissions.approve");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase.rpc("fieldops_build_payout_batch", {
    p_campaign_id: input.campaignId,
    p_label: input.label,
    p_admin: ctx.userId,
    p_method: "momo_manual",
  });
  if (error) return dbError(error, "Could not build the batch");
  const row = data as unknown as BatchRow;

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "fieldops.payout.build",
    targetType: "fieldops_payout_batch",
    targetId: row.id,
    summary: `Built "${input.label}": ${row.item_count} member(s), ${row.currency} ${(num(row.total_minor) / 100).toFixed(2)}`,
    reason: input.reason,
    before: {},
    after: { totalMinor: num(row.total_minor), itemCount: row.item_count },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return {
    status: 200,
    message:
      row.item_count === 0
        ? "Nothing to pay: no approved commissions with a payout number on file."
        : "Batch built. A different admin has to approve it before anything is sent.",
    data: mapBatch(row),
  };
}

export async function approvePayoutBatchCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { batchId: string; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<FieldOpsPayoutBatch>> {
  try {
    assertPermission(ctx, "fieldops.commissions.approve");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase.rpc("fieldops_approve_payout_batch", {
    p_batch_id: input.batchId,
    p_admin: ctx.userId,
  });
  if (error) return dbError(error, "Could not approve the batch");
  const row = data as unknown as BatchRow;

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "fieldops.payout.approve",
    targetType: "fieldops_payout_batch",
    targetId: row.id,
    summary: `Approved "${row.label}" for payment: ${row.currency} ${(num(row.total_minor) / 100).toFixed(2)}`,
    reason: input.reason,
    before: { status: "draft" },
    after: { status: "approved" },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return {
    status: 200,
    message: "Approved. It can now be paid.",
    data: mapBatch(row),
  };
}

export async function markPayoutItemCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    itemId: string;
    status: "paid" | "failed";
    reference?: string | null;
    failureReason?: string | null;
  },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<FieldOpsPayoutItem>> {
  try {
    assertPermission(ctx, "fieldops.commissions.pay");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase.rpc("fieldops_mark_payout_item", {
    p_item_id: input.itemId,
    p_admin: ctx.userId,
    p_status: input.status,
    p_reference: input.reference ?? undefined,
    p_failure: input.failureReason ?? undefined,
  });
  if (error) return dbError(error, "Could not record the transfer");
  const row = data as unknown as ItemRow;

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: `fieldops.payout.${input.status}`,
    targetType: "fieldops_payout_item",
    targetId: row.id,
    summary:
      input.status === "paid"
        ? `Paid ${row.currency} ${(num(row.amount_minor) / 100).toFixed(2)}, reference ${input.reference}`
        : `Transfer failed: ${input.failureReason}`,
    reason: input.reference ?? input.failureReason ?? "",
    before: { status: "pending" },
    after: { status: input.status },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return {
    status: 200,
    message:
      input.status === "paid"
        ? "Recorded as paid."
        : "Recorded as failed; the money goes back into the next batch.",
    data: mapItem(row, false),
  };
}

export async function cancelPayoutBatchCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { batchId: string; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<FieldOpsPayoutBatch>> {
  try {
    assertPermission(ctx, "fieldops.commissions.approve");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase.rpc("fieldops_cancel_payout_batch", {
    p_batch_id: input.batchId,
    p_admin: ctx.userId,
    p_reason: input.reason,
  });
  if (error) return dbError(error, "Could not cancel the batch");
  const row = data as unknown as BatchRow;

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "fieldops.payout.cancel",
    targetType: "fieldops_payout_batch",
    targetId: row.id,
    summary: `Cancelled "${row.label}"; the commissions go back into the pool.`,
    reason: input.reason,
    before: {},
    after: { status: "cancelled" },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return {
    status: 200,
    message: "Cancelled. Those commissions are ready to pay again.",
    data: mapBatch(row),
  };
}

/**
 * The finance team's CSV: one row per member with the full destination, so
 * it can be pasted into a mobile-money bulk upload. Gated on view_pii
 * because it is the one place an unmasked number leaves the console.
 */
export async function exportPayoutBatchCsvCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  batchId: string,
): Promise<AdminEnvelope<{ filename: string; csv: string }>> {
  try {
    assertPermission(ctx, "fieldops.commissions.pay");
    assertPermission(ctx, "users.view_pii");
  } catch (e) {
    return denied(e);
  }
  const { data: batch } = await supabase
    .from("fieldops_payout_batch")
    .select("id, label, currency, status")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) return { status: 404, message: "Batch not found" };
  const { data: items, error } = await supabase
    .from("fieldops_payout_item")
    .select(ITEM_COLUMNS)
    .eq("batch_id", batchId)
    .order("amount_minor", { ascending: false });
  if (error) return dbError(error, "Could not export the batch");

  const csvCell = (v: string | null) => {
    const s = v ?? "";
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header =
    "member,network,number,holder_name,amount,currency,commissions,status,reference";
  const lines = ((items ?? []) as unknown as ItemRow[]).map((i) => {
    const m = i.fieldops_team_member;
    return [
      csvCell(m?.full_name_snapshot ?? null),
      csvCell(m?.payout_momo_network ?? null),
      csvCell(m?.payout_momo_number ?? null),
      csvCell(m?.payout_holder_name ?? null),
      (num(i.amount_minor) / 100).toFixed(2),
      i.currency,
      String(num(i.commission_count)),
      i.status,
      csvCell(i.payment_reference),
    ].join(",");
  });

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "fieldops.payout.export",
    targetType: "fieldops_payout_batch",
    targetId: batchId,
    summary: `Exported ${lines.length} payout line(s) with full destinations`,
    reason: "CSV export for the mobile-money bulk upload",
    before: {},
    after: { lines: lines.length },
  });

  return {
    status: 200,
    data: {
      filename: `fieldops-payout-${batch.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`,
      csv: [header, ...lines].join("\n"),
    },
  };
}
