"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import {
  clearPayoutReviewAdminCore,
  createPayoutAdminCore,
  refundTransactionAdminCore,
  sendPayoutAdminCore,
  settlePayoutAdminCore,
} from "@abonten/services/admin/finance/financeActionsCore";
import {
  adminRefundSchema,
  clearPayoutReviewSchema,
  createPayoutSchema,
  sendPayoutSchema,
  settlePayoutSchema,
} from "@abonten/validation/adminSchemas";
import { revalidatePath } from "next/cache";
import { adminError, svc } from "./_shared";

// ── Finance (money-path — step-up) ──────────────────────────

export async function refundTransaction(input: unknown) {
  const parsed = adminRefundSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await refundTransactionAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/finance/transactions/${parsed.data.transactionId}`);
      revalidatePath("/finance/refunds");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function settlePayout(input: unknown) {
  const parsed = settlePayoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await settlePayoutAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/finance/payouts");
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function createPayout(input: unknown) {
  const parsed = createPayoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await createPayoutAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/finance/organizers/${parsed.data.organizerId}`);
      revalidatePath("/finance/payouts");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

// Clear the credit-share review on a held payout (payout_credit_review).
export async function clearPayoutReview(input: unknown) {
  const parsed = clearPayoutReviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await clearPayoutReviewAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/finance/payouts/${parsed.data.payoutId}`);
      revalidatePath("/finance/payouts");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

// Initiate a real Paystack transfer for an existing pending payout.
// No-op (409) unless PAYSTACK_TRANSFERS_ENABLED=true — see
// sendPayoutAdminCore. The payout settles via the transfer.* webhook.
export async function sendPayout(input: unknown) {
  const parsed = sendPayoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await sendPayoutAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/finance/payouts/${parsed.data.payoutId}`);
      revalidatePath("/finance/payouts");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}
