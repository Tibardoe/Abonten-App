import { logger } from "@abonten/core/logger";
import {
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  ContentCampaign,
  ContentCampaignEvent,
  ContentCampaignLedgerEntry,
  ContentCampaignStatus,
} from "@abonten/types/contentType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { AdminCampaignActionInput } from "@abonten/validation/contentSchemas";
import {
  CAMPAIGN_SELECT,
  getContentCampaignHistoryCore,
  mapCampaign,
} from "../../content/campaigns/contentCampaignCore";
import { notifyCampaign } from "../../content/contentNotifyCore";
import { refundTransaction } from "../../payments/gateway/paystackService";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Admin › Spotlight › Campaigns: the review queue and the money-path
// actions. approve / reject / pause / resume / cancel need
// spotlight.campaigns.review (step-up, checked by the transport); a refund
// additionally needs finance.refund. Every action is audited and every
// state change goes through content_campaign_transition().

type RequestMeta = Record<string, unknown> | undefined;
const PAGE = 25;
const denied = <T>(e: unknown): AdminEnvelope<T> =>
  adminError(e) as AdminEnvelope<T>;

type Cursor = { createdAt: string; id: string };

export async function listCampaignsAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: { status: ContentCampaignStatus | "any"; cursor?: string | null },
): Promise<
  AdminEnvelope<{
    rows: ContentCampaign[];
    nextCursor: string | null;
    hasNextPage: boolean;
  }>
> {
  try {
    assertPermission(ctx, "spotlight.view");
  } catch (e) {
    return denied(e);
  }
  const cursor = decodeCursor<Cursor>(filters.cursor);
  let query = supabase
    .from("content_campaign")
    .select(CAMPAIGN_SELECT)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE + 1);
  if (filters.status !== "any") query = query.eq("status", filters.status);
  else query = query.neq("status", "draft");
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }
  const { data, error } = await query;
  if (error) {
    logger.error(`listCampaignsAdminCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't load campaigns." };
  }
  const { page, hasNextPage } = splitPage(data ?? [], PAGE);
  const last = page[page.length - 1];
  return {
    status: 200,
    data: {
      rows: page.map((r) => mapCampaign(r as never)),
      hasNextPage,
      nextCursor:
        hasNextPage && last
          ? encodeCursor<Cursor>({ createdAt: last.created_at, id: last.id })
          : null,
    },
  };
}

export async function getCampaignAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  campaignId: string,
): Promise<
  AdminEnvelope<{
    campaign: ContentCampaign;
    events: ContentCampaignEvent[];
    ledger: ContentCampaignLedgerEntry[];
    transaction: {
      id: string;
      status: string;
      amount: number;
      paystackReference: string | null;
    } | null;
  }>
> {
  try {
    assertPermission(ctx, "spotlight.view");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase
    .from("content_campaign")
    .select(CAMPAIGN_SELECT)
    .eq("id", campaignId)
    .maybeSingle();
  if (error) {
    logger.error(`getCampaignAdminCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't load the campaign." };
  }
  if (!data) return { status: 404, message: "Campaign not found." };
  const campaign = mapCampaign(data as never);
  const history = await getContentCampaignHistoryCore(supabase, campaignId);
  let transaction = null;
  if (campaign.transactionId) {
    const { data: tx } = await supabase
      .from("transaction")
      .select("id, status, amount, paystack_reference")
      .eq("id", campaign.transactionId)
      .maybeSingle();
    if (tx) {
      transaction = {
        id: tx.id,
        status: tx.status,
        amount: Number(tx.amount),
        paystackReference: tx.paystack_reference,
      };
    }
  }
  return { status: 200, data: { campaign, ...history, transaction } };
}

const ACTION_TO_STATUS: Record<
  AdminCampaignActionInput["action"],
  ContentCampaignStatus
> = {
  approve: "active",
  reject: "rejected",
  pause: "paused",
  resume: "active",
  cancel: "cancelled",
};

export async function campaignActionAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: AdminCampaignActionInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<ContentCampaign>> {
  try {
    assertPermission(ctx, "spotlight.campaigns.review");
  } catch (e) {
    return denied(e);
  }
  const { data: before } = await supabase
    .from("content_campaign")
    .select("id, status, version, advertiser_id")
    .eq("id", input.campaignId)
    .maybeSingle();
  if (!before) return { status: 404, message: "Campaign not found." };
  if (before.version !== input.expectedVersion) {
    return {
      status: 409,
      message: "This campaign changed. Reload and try again.",
    };
  }
  const to = ACTION_TO_STATUS[input.action];
  if (
    (to === "rejected" || to === "cancelled" || to === "paused") &&
    !(input.reason && input.reason.trim().length >= 3)
  ) {
    return { status: 400, message: "Give a reason." };
  }
  const { data: moved, error } = await supabase.rpc(
    "content_campaign_transition",
    {
      p_campaign_id: input.campaignId,
      p_to: to,
      p_actor_id: ctx.userId,
      p_actor_kind: "admin",
      p_reason: input.reason ?? undefined,
    },
  );
  if (error) {
    if (error.code === "22023") return { status: 409, message: error.message };
    logger.error(`campaignActionAdminCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't update the campaign." };
  }
  const newStatus =
    (moved as unknown as { status?: string } | null)?.status ?? to;
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: `spotlight.campaign.${input.action}`,
    targetType: "content_campaign",
    targetId: input.campaignId,
    summary: `Campaign ${input.action}: ${before.status} → ${newStatus}`,
    reason: input.reason ?? null,
    before: { status: before.status },
    after: { status: newStatus },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  await notifyCampaign(supabase, {
    id: input.campaignId,
    advertiserId: before.advertiser_id,
    status: newStatus,
    reason:
      to === "rejected" || to === "paused" || to === "cancelled"
        ? (input.reason ?? null)
        : null,
  });
  const full = await getCampaignAdminCore(supabase, ctx, input.campaignId);
  return full.status === 200 && full.data
    ? { status: 200, message: "Done.", data: full.data.campaign }
    : { status: 200, message: "Done." };
}

/**
 * Refunds the unspent remainder of a rejected / cancelled / completed
 * campaign through Paystack. Exactly once per campaign (the ledger key).
 */
export async function refundCampaignAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { campaignId: string; expectedVersion: number; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ refundedMinor: number }>> {
  try {
    assertPermission(ctx, "spotlight.campaigns.review");
    assertPermission(ctx, "finance.refund");
  } catch (e) {
    return denied(e);
  }
  const { data: campaign } = await supabase
    .from("content_campaign")
    .select("id, status, version, advertiser_id, transaction_id, currency")
    .eq("id", input.campaignId)
    .maybeSingle();
  if (!campaign) return { status: 404, message: "Campaign not found." };
  if (campaign.version !== input.expectedVersion) {
    return {
      status: 409,
      message: "This campaign changed. Reload and try again.",
    };
  }
  const { data: refundable } = await supabase.rpc(
    "content_campaign_refundable_minor",
    {
      p_campaign_id: input.campaignId,
    },
  );
  const amount = Number(refundable ?? 0);
  if (amount <= 0) {
    return { status: 409, message: "Nothing to refund for this campaign." };
  }
  if (!campaign.transaction_id) {
    return { status: 409, message: "This campaign has no recorded payment." };
  }
  const { data: tx } = await supabase
    .from("transaction")
    .select("id, status, paystack_reference, payment_method")
    .eq("id", campaign.transaction_id)
    .maybeSingle();
  if (!tx || tx.status !== "successful" || !tx.paystack_reference) {
    return {
      status: 409,
      message: "The payment is not in a refundable state.",
    };
  }

  // Record first (idempotent, moves transaction to refund_pending), then ask
  // Paystack; a Paystack failure is surfaced and the webhook / a retry can
  // reconcile it, exactly like ticket refunds.
  const { data: recorded, error: recordError } = await supabase.rpc(
    "content_campaign_record_refund",
    {
      p_campaign_id: input.campaignId,
      p_amount_minor: amount,
      p_actor_id: ctx.userId,
      p_reason: input.reason,
    },
  );
  if (recordError) {
    if (recordError.code === "22023")
      return { status: 409, message: recordError.message };
    logger.error(
      `content_campaign_record_refund failed: ${recordError.message}`,
    );
    return { status: 500, message: "Couldn't record the refund." };
  }
  if ((recorded as unknown as { replayed?: boolean } | null)?.replayed) {
    return { status: 409, message: "This campaign was already refunded." };
  }
  try {
    await refundTransaction(tx.paystack_reference, amount);
  } catch (error) {
    logger.error(
      `refundCampaignAdminCore: Paystack refund failed for ${tx.paystack_reference}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    // The ledger says refund requested; the transaction sits in
    // refund_pending for Finance › Refunds to retry from Paystack's side.
    return {
      status: 500,
      message:
        "The refund was recorded but Paystack refused the request. Check Finance › Refunds and retry there.",
    };
  }
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "spotlight.campaign.refund",
    targetType: "content_campaign",
    targetId: input.campaignId,
    summary: `Refunded ${amount} pesewas of an unspent campaign budget`,
    reason: input.reason,
    after: { refunded_minor: amount, transaction_id: campaign.transaction_id },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  await notifyCampaign(supabase, {
    id: input.campaignId,
    advertiserId: campaign.advertiser_id,
    status: "refunded",
    reason: `GH₵ ${(amount / 100).toFixed(2)} is being returned to your payment method.`,
  });
  return {
    status: 200,
    message: "Refund requested.",
    data: { refundedMinor: amount },
  };
}
