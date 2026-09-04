import { logger } from "@abonten/core/logger";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { SupabaseClient } from "@supabase/supabase-js";
import { issueRefundCore } from "../../organizer/issueRefundCore";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// The write side of the Finance ops centre. Kept separate from
// financeAdminCore.ts (which is strictly read-only). Every function here is
// permission-checked (finance.refund / finance.payout), audited, and the
// transport enforces a fresh step-up re-auth on top.

// ── Refund ──────────────────────────────────────────────────

export async function refundTransactionAdminCore(
  supabase: SupabaseClient,
  ctx: AdminContext,
  input: { transactionId: string; reason: string },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "finance.refund");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  // `supabase` is already the service-role client here — this is the same
  // "identity proven upstream" trust context cancelEvent uses: no
  // expectedUserId, so any transaction is in scope. issueRefundCore is
  // idempotent (re-checks transaction.status) and only refunds the ticket
  // revenue, retaining the Abonten service fee.
  const res = await issueRefundCore(supabase, input.transactionId);

  if (res.status === 200) {
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "finance.refund",
      targetType: "transaction",
      targetId: input.transactionId,
      summary: `Refund requested — ${res.message}`,
      reason: input.reason,
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
  }

  return { status: res.status, message: res.message };
}

// ── Payout settlement ───────────────────────────────────────

export async function settlePayoutAdminCore(
  supabase: SupabaseClient,
  ctx: AdminContext,
  input: {
    payoutId: string;
    status: "completed" | "failed" | "cancelled";
    failureReason?: string | null;
    reason: string;
  },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope<{ status: string }>> {
  try {
    assertPermission(ctx, "finance.payout");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data, error } = await supabase.rpc("admin_settle_payout", {
    p_payout_id: input.payoutId,
    p_status: input.status,
    p_failure_reason: input.failureReason ?? null,
  });

  if (error) {
    logger.error(`settlePayoutAdminCore failed: ${error.message}`);
    if (/already/i.test(error.message)) {
      return { status: 409, message: error.message };
    }
    if (/not found/i.test(error.message)) {
      return { status: 404, message: "Payout not found" };
    }
    return { status: 400, message: error.message };
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "finance.payout.settle",
    targetType: "payout",
    targetId: input.payoutId,
    summary: `Payout → ${input.status}${
      input.status === "failed" && input.failureReason
        ? ` (${input.failureReason})`
        : ""
    }`,
    reason: input.reason,
    after: { status: input.status },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message: `Payout marked ${input.status}.`,
    data: { status: String(data ?? input.status) },
  };
}

export async function createPayoutAdminCore(
  supabase: SupabaseClient,
  ctx: AdminContext,
  input: {
    organizerId: string;
    payoutAccountId: string;
    amount: number;
    currency: string;
    reason: string;
  },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope<{ payoutId: string; reference: string }>> {
  try {
    assertPermission(ctx, "finance.payout");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data, error } = await supabase
    .rpc("admin_create_payout", {
      p_organizer_id: input.organizerId,
      p_payout_account_id: input.payoutAccountId,
      p_amount: input.amount,
      p_currency: input.currency,
    })
    .single<{ payout_id: string; reference: string }>();

  if (error) {
    logger.error(`createPayoutAdminCore failed: ${error.message}`);
    if (/exceeds available balance/i.test(error.message)) {
      return {
        status: 400,
        message: "Amount exceeds the organizer's available balance.",
      };
    }
    if (/Invalid payout account/i.test(error.message)) {
      return {
        status: 400,
        message: "That payout account isn't valid for this organizer.",
      };
    }
    return { status: 400, message: error.message };
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "finance.payout.create",
    targetType: "payout",
    targetId: data.payout_id,
    summary: `Originated a ${input.currency} ${input.amount} payout for ${input.organizerId} (${data.reference})`,
    reason: input.reason,
    after: {
      organizerId: input.organizerId,
      amount: input.amount,
      currency: input.currency,
      reference: data.reference,
    },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message: `Payout created (${data.reference}).`,
    data: { payoutId: data.payout_id, reference: data.reference },
  };
}
