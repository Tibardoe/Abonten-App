import { logger } from "@abonten/core/logger";
import { fromMajor } from "@abonten/core/money/money";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { issueRefundCore } from "../../organizer/issueRefundCore";
import {
  NoProviderError,
  resolveProviderAccount,
} from "../../payments/providers/registry";
import { PaymentProviderError } from "../../payments/providers/types";
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
  supabase: ServiceRoleClient,
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
  supabase: ServiceRoleClient,
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
    p_failure_reason: input.failureReason ?? undefined,
  });

  if (error) {
    logger.error(`settlePayoutAdminCore failed: ${error.message}`);
    // 55000: held for a credit-share review (payout_guard_review trigger).
    if (/already/i.test(error.message) || error.code === "55000") {
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
  supabase: ServiceRoleClient,
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

// ── Payout: initiate a real provider transfer ───────────────
// Attaches an automated transfer to an existing pending payout through the
// payout market's provider account. The payout is NOT marked completed here
// — the provider's transfer.success webhook settles it. GATED per market:
// the provider row's `payouts_enabled` switch (Admin › Markets) must be on
// and the adapter must support payouts; otherwise this returns 409 and the
// manual "send then admin_settle_payout" flow is unaffected.

export async function sendPayoutAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { payoutId: string; reason: string },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope<{ transferCode: string; transferStatus: string }>> {
  try {
    assertPermission(ctx, "finance.payout");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data: payout, error: payoutError } = await supabase
    .from("payout")
    .select(
      "id, organizer_id, payout_account_id, amount, currency, status, reference, transfer_status, review_status, country_code, payout_account:payout_account_id(account_type, account_holder_name, provider, provider_code, account_number, country_code, currency)",
    )
    .eq("id", input.payoutId)
    .maybeSingle();

  if (payoutError) {
    logger.error(
      `sendPayoutAdminCore: payout lookup failed: ${payoutError.message}`,
    );
    return { status: 500, message: "Couldn't load that payout." };
  }
  if (!payout) return { status: 404, message: "Payout not found" };

  if (payout.status !== "processing") {
    return {
      status: 409,
      message: `This payout is already ${payout.status} — nothing to send.`,
    };
  }
  if (payout.transfer_status && payout.transfer_status !== "none") {
    return {
      status: 409,
      message: `A transfer is already ${payout.transfer_status} for this payout.`,
    };
  }
  // Money must not leave before the credit-share review is cleared (the
  // payout couldn't be completed afterwards anyway).
  if (payout.review_status === "required") {
    return {
      status: 409,
      message:
        "This payout is held for review: a large share of the event's sales was paid with Abonten Credit. Clear the review first.",
    };
  }

  const acct = payout.payout_account;
  if (!acct) {
    return { status: 400, message: "This payout has no payout account." };
  }
  // `payout_account.account_type` is free text in the schema; only the two
  // kinds a provider transfer supports may reach the gateway.
  const accountType =
    acct.account_type === "bank" || acct.account_type === "mobile_money"
      ? acct.account_type
      : null;
  if (!accountType) {
    return {
      status: 400,
      message: `Unsupported payout account type: ${acct.account_type}`,
    };
  }

  try {
    const { provider, account } = await resolveProviderAccount({
      countryCode: payout.country_code ?? acct.country_code,
      currency: payout.currency,
    });
    if (!account.payoutsEnabled || !provider.capabilities(account).payouts) {
      return {
        status: 409,
        message:
          "Automated transfers aren't enabled for this market. Send the funds, then mark this payout completed.",
      };
    }
    // The destination code was captured when the organizer chose their
    // bank/network (provider_code); older accounts saved only a name, which
    // is matched against the provider's destination list.
    let destinationCode = acct.provider_code;
    if (!destinationCode) {
      const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
      const destinations = await provider.listPayoutDestinations(
        account,
        payout.currency,
        accountType,
      );
      const target = norm(acct.provider ?? "");
      const hit =
        destinations.find((d) => norm(d.name) === target) ??
        destinations.find(
          (d) =>
            target &&
            (norm(d.name).includes(target) || target.includes(norm(d.name))),
        );
      if (!hit) {
        return {
          status: 400,
          message: `Couldn't map "${acct.provider ?? "the account's provider"}" to a ${provider.code} ${accountType === "mobile_money" ? "mobile-money" : "bank"} destination — settle this payout manually.`,
        };
      }
      destinationCode = hit.code;
    }
    const recipientCode = await provider.createTransferRecipient(account, {
      method: accountType,
      name: acct.account_holder_name,
      accountNumber: acct.account_number,
      destinationCode,
      currency: payout.currency,
    });
    const { transferCode, status } = await provider.initiateTransfer(account, {
      amount: fromMajor(Number(payout.amount), payout.currency),
      recipientCode,
      reference: payout.reference,
      reason: `Abonten organizer payout ${payout.reference}`,
    });

    const { error: updateError } = await supabase
      .from("payout")
      .update({
        transfer_code: transferCode,
        transfer_recipient_code: recipientCode,
        transfer_status: "pending",
        transfer_initiated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", payout.id)
      .eq("status", "processing");

    if (updateError) {
      // The transfer is already in flight at the provider — surface it so an
      // admin reconciles rather than silently losing the transfer_code.
      logger.error(
        `sendPayoutAdminCore: transfer ${transferCode} initiated but payout ${payout.id} update failed: ${updateError.message}`,
      );
      return {
        status: 500,
        message: `Transfer ${transferCode} was initiated at the provider but the payout couldn't be updated — reconcile manually.`,
      };
    }

    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "finance.payout.send",
      targetType: "payout",
      targetId: payout.id,
      summary: `Initiated ${provider.code} transfer ${transferCode} (${status}) for ${payout.currency} ${payout.amount} — ${payout.reference}`,
      reason: input.reason,
      after: { transferCode, transferStatus: "pending" },
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });

    return {
      status: 200,
      message: `Transfer initiated (${transferCode}). It settles when the provider confirms.`,
      data: { transferCode, transferStatus: status },
    };
  } catch (e) {
    if (e instanceof PaymentProviderError || e instanceof NoProviderError) {
      return { status: 400, message: e.message };
    }
    logger.error("sendPayoutAdminCore failed", e);
    return { status: 500, message: "Couldn't initiate the transfer." };
  }
}

// ── Payout review (credit-funded sales) ─────────────────────

/**
 * Clears the credit-share review on a held payout (see the
 * payout_credit_review trigger): a person has checked that the event's
 * credit-funded sales are genuine. The payout can then be sent/completed
 * as usual, and the events cleared here aren't flagged again.
 */
export async function clearPayoutReviewAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { payoutId: string; reason: string },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope<{ reviewStatus: string }>> {
  try {
    assertPermission(ctx, "finance.payout");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { error } = await supabase.rpc("admin_clear_payout_review", {
    p_payout_id: input.payoutId,
    p_admin_id: ctx.userId,
    p_note: input.reason,
  });

  if (error) {
    logger.error(`clearPayoutReviewAdminCore failed: ${error.message}`);
    if (error.code === "P0002") {
      return { status: 404, message: "Payout not found" };
    }
    if (error.code === "55000") {
      return { status: 409, message: error.message };
    }
    return { status: 400, message: error.message };
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "finance.payout.review_clear",
    targetType: "payout",
    targetId: input.payoutId,
    summary: "Cleared the credit-share review on a held payout",
    reason: input.reason,
    after: { reviewStatus: "cleared" },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message: "Review cleared. The payout can now be completed.",
    data: { reviewStatus: "cleared" },
  };
}
