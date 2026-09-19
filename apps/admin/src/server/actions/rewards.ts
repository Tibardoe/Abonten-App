"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import { cedisToCreditMinor } from "@abonten/core/rewards/creditAmount";
import { runMonthlyRebatesCore } from "@abonten/services/admin/rewards/rebateAdminCore";
import {
  decideHeldRewardCore,
  publishRewardRuleVersionCore,
  setRewardRuleActiveCore,
} from "@abonten/services/admin/rewards/referralAdminCore";
import {
  approveCreditAdjustmentCore,
  grantGoodwillCreditCore,
  rejectCreditAdjustmentCore,
  requestCreditAdjustmentCore,
  setCreditAccountStatusCore,
  setReferralCodeDisabledCore,
  updateRewardsSettingsCore,
} from "@abonten/services/admin/rewards/rewardsAdminCore";
import {
  creditAccountStatusSchema,
  creditAdjustmentDecisionSchema,
  creditAdjustmentSchema,
  goodwillCreditSchema,
  rebateRunSchema,
  referralCodeDisabledSchema,
  rewardReviewSchema,
  rewardRuleActivationSchema,
  rewardRuleVersionSchema,
  rewardsSettingsSchema,
} from "@abonten/validation/adminSchemas";
import { revalidatePath } from "next/cache";
import { adminError, firstIssue, svc } from "./_shared";

// Held rewards: approve (release when due) or reject. rewards.review; no
// step-up -- it can only ever pay out a reward the engine already priced.
export async function decideHeldReward(input: unknown) {
  const parsed = rewardReviewSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await decideHeldRewardCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/rewards/queue");
      revalidatePath("/rewards/referrals");
    }
    return res;
  } catch (e) {
    return adminError(e, "decideHeldReward");
  }
}

// Rule versions change what the program pays: rewards.configure + step-up.
export async function publishRewardRuleVersion(input: unknown) {
  const parsed = rewardRuleVersionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await publishRewardRuleVersionCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/rewards/rules");
    return res;
  } catch (e) {
    return adminError(e, "publishRewardRuleVersion");
  }
}

export async function setRewardRuleActive(input: unknown) {
  const parsed = rewardRuleActivationSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await setRewardRuleActiveCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/rewards/rules");
      revalidatePath("/rewards");
    }
    return res;
  } catch (e) {
    return adminError(e, "setRewardRuleActive");
  }
}

// Runs the monthly rebates for a month by hand. It can post credit (when
// shadow mode is off), so rewards.configure + step-up, like rule changes.
export async function runMonthlyRebates(input: unknown) {
  const parsed = rebateRunSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await runMonthlyRebatesCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/rewards/rebates");
    return res;
  } catch (e) {
    return adminError(e, "runMonthlyRebates");
  }
}

export async function requestCreditAdjustment(input: unknown) {
  const parsed = creditAdjustmentSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const d = parsed.data;
    const res = await requestCreditAdjustmentCore(
      svc(),
      ctx,
      {
        userId: d.userId,
        direction: d.direction,
        amountMinor: cedisToCreditMinor(d.amount),
        reason: d.reason,
        userLabel: d.userLabel || null,
        spendScope: d.spendScope,
        expiresAt: d.expiresInDays
          ? new Date(Date.now() + d.expiresInDays * 86_400_000).toISOString()
          : null,
        allowNegative: d.allowNegative,
      },
      await currentRequestMeta(),
    );
    if (res.status === 200 || res.status === 202) {
      revalidatePath(`/rewards/accounts/${d.userId}`);
      revalidatePath("/rewards");
    }
    return res;
  } catch (e) {
    return adminError(e, "requestCreditAdjustment");
  }
}

export async function decideCreditAdjustment(input: unknown) {
  const parsed = creditAdjustmentDecisionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const meta = await currentRequestMeta();
    const res =
      parsed.data.decision === "approve"
        ? await approveCreditAdjustmentCore(
            svc(),
            ctx,
            { requestId: parsed.data.requestId, note: parsed.data.note },
            meta,
          )
        : await rejectCreditAdjustmentCore(
            svc(),
            ctx,
            { requestId: parsed.data.requestId, note: parsed.data.note ?? "" },
            meta,
          );
    if (res.status === 200) {
      revalidatePath("/rewards");
      revalidatePath("/rewards/accounts", "layout");
    }
    return res;
  } catch (e) {
    return adminError(e, "decideCreditAdjustment");
  }
}

export async function grantGoodwillCredit(input: unknown) {
  const parsed = goodwillCreditSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await grantGoodwillCreditCore(
      svc(),
      ctx,
      {
        userId: parsed.data.userId,
        amountMinor: cedisToCreditMinor(parsed.data.amount),
        reason: parsed.data.reason,
        requestId: parsed.data.requestId,
      },
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/rewards/accounts/${parsed.data.userId}`);
    }
    return res;
  } catch (e) {
    return adminError(e, "grantGoodwillCredit");
  }
}

export async function setCreditAccountStatus(input: unknown) {
  const parsed = creditAccountStatusSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await setCreditAccountStatusCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/rewards/accounts/${parsed.data.userId}`);
      revalidatePath("/rewards/accounts");
    }
    return res;
  } catch (e) {
    return adminError(e, "setCreditAccountStatus");
  }
}

// Turn a user's referral code off (spam / a reported farm) or back on.
export async function setReferralCodeDisabled(input: unknown) {
  const parsed = referralCodeDisabledSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await setReferralCodeDisabledCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/rewards/accounts/${parsed.data.userId}`);
    }
    return res;
  } catch (e) {
    return adminError(e, "setReferralCodeDisabled");
  }
}

export async function updateRewardsSettings(input: unknown) {
  const parsed = rewardsSettingsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await updateRewardsSettingsCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/rewards");
      revalidatePath("/rewards/settings");
    }
    return res;
  } catch (e) {
    return adminError(e, "updateRewardsSettings");
  }
}
