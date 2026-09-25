import { getCheckoutExpiryTimestamp } from "@abonten/core/checkoutExpiry";
import {
  refundableMinor,
  remainingMinor,
} from "@abonten/core/content/campaignMoney";
import { logger } from "@abonten/core/logger";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { money, toMajor } from "@abonten/core/money/money";
import { parseWKBHex } from "@abonten/core/parseWKBHex";
import type {
  ContentCampaign,
  ContentCampaignCheckout,
  ContentCampaignEvent,
  ContentCampaignLedgerEntry,
  ContentCampaignMetrics,
  ContentCampaignStatus,
} from "@abonten/types/contentType";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { CreateContentCampaignInput } from "@abonten/validation/contentSchemas";
import { cancelPromotionCheckout } from "../../checkout/checkoutCancellation";
import { checkRateLimit } from "../../security/rateLimit";
import { notifyCampaign } from "../contentNotifyCore";
import { type Envelope, FAIL } from "../contentShared";
import { quotePromotion, undeliverableMessage } from "./contentPromotionCore";

// Promoted Spotlight campaigns, advertiser side: creating a campaign from a
// server-priced budget quote (contentPromotionCore), starting its
// money-path checkout, reading and pausing / resuming / cancelling. Money moves only through the SQL functions of
// migration 20260916120200; the state machine is
// content_campaign_transition(). Payment is the existing Paystack path with
// a fifth payment_attempt target (content_campaign_checkout_id).

type CampaignRow = Database["public"]["Tables"]["content_campaign"]["Row"];

export function mapCampaign(
  row: CampaignRow & {
    content_post?: {
      id: string;
      caption: string | null;
      kind: string;
      event_id: string | null;
      place_id: string | null;
      content_media?:
        | { thumbnail_url: string | null; position: number }[]
        | null;
    } | null;
    advertiser?: {
      id: string;
      username: string | null;
      full_name: string | null;
    } | null;
    targeting_lat?: number | null;
    targeting_lng?: number | null;
  },
): ContentCampaign {
  const money = {
    paidMinor: Number(row.paid_minor),
    spentMinor: Number(row.spent_minor),
    refundedMinor: Number(row.refunded_minor),
  };
  const media = (row.content_post?.content_media ?? [])
    .slice()
    .sort((a, b) => a.position - b.position);
  return {
    id: row.id,
    postId: row.post_id,
    advertiserId: row.advertiser_id,
    objective: row.objective as ContentCampaign["objective"],
    budgetMinor: Number(row.budget_minor),
    currency: row.currency,
    durationDays: row.duration_days,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status as ContentCampaignStatus,
    pricingVersion: row.pricing_version,
    cpmMinor: row.cpm_minor,
    impressionGoal: Number(row.impression_goal),
    estimatedImpressions: Number(row.estimated_impressions),
    estimatedReachLow: row.estimated_reach_low,
    estimatedReachHigh: row.estimated_reach_high,
    estimateBasis: row.estimate_basis as ContentCampaign["estimateBasis"],
    endReason: row.end_reason as ContentCampaign["endReason"],
    targeting: {
      lat: row.targeting_lat ?? null,
      lng: row.targeting_lng ?? null,
      radiusKm:
        row.targeting_radius_km === null
          ? null
          : Number(row.targeting_radius_km),
      categories: row.targeting_categories ?? [],
    },
    ...money,
    remainingMinor: remainingMinor(money),
    refundableMinor: refundableMinor({ status: row.status, ...money }),
    checkoutId: row.checkout_id,
    transactionId: row.transaction_id,
    reviewReason: row.review_reason,
    pauseReason: row.pause_reason,
    pauseSource: row.pause_source as ContentCampaign["pauseSource"],
    impressions: row.impression_count,
    reach: row.reach_count,
    views: row.view_count,
    completions: row.completion_count,
    clicks: row.click_count,
    conversions: row.conversion_count,
    activatedAt: row.activated_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    post: row.content_post
      ? {
          id: row.content_post.id,
          caption: row.content_post.caption,
          thumbnailUrl: media[0]?.thumbnail_url ?? null,
          kind: row.content_post.kind as "spotlight" | "story",
          eventId: row.content_post.event_id,
          placeId: row.content_post.place_id,
        }
      : null,
    advertiser: row.advertiser
      ? {
          id: row.advertiser.id,
          username: row.advertiser.username,
          fullName: row.advertiser.full_name,
        }
      : null,
  };
}

export const CAMPAIGN_SELECT =
  "*, content_post(id, caption, kind, event_id, place_id, content_media!content_media_post_id_fkey(thumbnail_url, position)), advertiser:user_info!content_campaign_advertiser_id_fkey(id, username, full_name)";

/**
 * Creates a campaign in `pending_payment` with its checkout. Returns the
 * checkout the web /checkout page or the mobile payment screen pays.
 */
export async function createContentCampaignCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: CreateContentCampaignInput,
): Promise<
  Envelope<{ campaign: ContentCampaign; checkout: ContentCampaignCheckout }>
> {
  if (!(await checkRateLimit(`content-campaign:${userId}`, 20, 3600))) {
    return {
      status: 429,
      message: "Too many campaigns started. Please try again later.",
    };
  }
  const quote = await quotePromotion(supabase, userId, input);
  if (quote.status !== 200 || !quote.data) {
    return { status: quote.status, message: quote.message };
  }
  const { estimate, post } = quote.data;
  if (!estimate.deliverable) {
    return { status: 409, message: undeliverableMessage(estimate) };
  }
  const { data: live } = await supabase
    .from("content_campaign")
    .select("id")
    .eq("post_id", post.id)
    .in("status", [
      "pending_payment",
      "payment_confirmed",
      "pending_review",
      "scheduled",
      "active",
      "paused",
    ])
    .limit(1)
    .maybeSingle();
  if (live) {
    return {
      status: 409,
      message: "This Spotlight already has a campaign in progress.",
    };
  }

  const startsAt = new Date(input.startsAt);
  const now = Date.now();
  if (Number.isNaN(startsAt.getTime())) {
    return { status: 400, message: "Choose a start time." };
  }
  if (startsAt.getTime() > now + 30 * 24 * 3600 * 1000) {
    return { status: 400, message: "Start within the next 30 days." };
  }
  const effectiveStart = new Date(Math.max(startsAt.getTime(), now));
  const endsAt = new Date(
    effectiveStart.getTime() + estimate.durationDays * 86_400_000,
  );

  const { data: campaign, error: campaignError } = await supabase
    .from("content_campaign")
    .insert({
      post_id: post.id,
      advertiser_id: userId,
      objective: input.objective,
      budget_minor: estimate.budgetMinor,
      currency: estimate.currency,
      duration_days: estimate.durationDays,
      starts_at: effectiveStart.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "draft",
      targeting_location: post.targetingLocation,
      targeting_radius_km: post.targetingRadiusKm,
      // Interest/category targeting is not offered: nothing reliable says
      // what a viewer is interested in, and targeting the post's own
      // category would change nothing.
      targeting_categories: [],
      pricing_version: estimate.pricingVersion,
      cpm_minor: estimate.cpmMinor,
      impression_goal: estimate.impressionGoal,
      estimated_impressions: estimate.estimatedImpressions,
      estimated_reach_low: estimate.reachLow,
      estimated_reach_high: estimate.reachHigh,
      estimate_basis: estimate.basis,
    } as never)
    .select("*")
    .single();
  if (campaignError || !campaign) {
    logger.error(
      `createContentCampaignCore insert failed: ${campaignError?.message}`,
    );
    return FAIL;
  }

  const { data: checkout, error: checkoutError } = await supabase
    .from("content_campaign_checkout")
    .insert({
      campaign_id: campaign.id,
      owner_id: userId,
      // Major units in the campaign's own currency: whole francs or yen,
      // pesewas, thousandths of a dinar — never a fixed ÷100.
      unit_price: toMajor(money(estimate.budgetMinor, estimate.currency)),
      total_price: toMajor(money(estimate.budgetMinor, estimate.currency)),
      currency: estimate.currency,
      status: "pending",
      expires_at: getCheckoutExpiryTimestamp().toISOString(),
    })
    .select("*")
    .single();
  if (checkoutError || !checkout) {
    logger.error(
      `createContentCampaignCore checkout failed: ${checkoutError?.message}`,
    );
    await supabase.from("content_campaign").delete().eq("id", campaign.id);
    return FAIL;
  }
  await supabase
    .from("content_campaign")
    .update({ checkout_id: checkout.id })
    .eq("id", campaign.id);
  const { error: moveError } = await supabase.rpc(
    "content_campaign_transition",
    {
      p_campaign_id: campaign.id,
      p_to: "pending_payment",
      p_actor_id: userId,
      p_actor_kind: "advertiser",
      p_reason: "Checkout started",
    },
  );
  if (moveError) {
    logger.error(
      `createContentCampaignCore transition failed: ${moveError.message}`,
    );
    return FAIL;
  }
  const full = await getContentCampaignCore(supabase, userId, campaign.id);
  if (full.status !== 200 || !full.data) return FAIL;
  return {
    status: 200,
    data: {
      campaign: full.data,
      checkout: {
        id: checkout.id,
        campaignId: campaign.id,
        status: "pending",
        totalPrice: Number(checkout.total_price),
        currency: checkout.currency,
        expiresAt: checkout.expires_at,
        summaryLabel: summaryLabel(
          estimate.budgetMinor,
          estimate.durationDays,
          checkout.currency,
        ),
        estimatedReachLow: estimate.reachLow,
        estimatedReachHigh: estimate.reachHigh,
        postCaption: null,
      },
    },
  };
}

export async function getContentCampaignCheckoutCore(
  supabase: ServiceRoleClient,
  userId: string,
  checkoutId: string,
): Promise<Envelope<ContentCampaignCheckout & { campaign: ContentCampaign }>> {
  await supabase.rpc("expire_stale_content_campaign_checkouts");
  const { data, error } = await supabase
    .from("content_campaign_checkout")
    .select(
      "*, content_campaign!content_campaign_checkout_campaign_id_fkey(post_id, content_post(caption))",
    )
    .eq("id", checkoutId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) {
    logger.error(`getContentCampaignCheckoutCore failed: ${error.message}`);
    return FAIL;
  }
  if (!data) return { status: 404, message: "Checkout not found." };
  const campaign = await getContentCampaignCore(
    supabase,
    userId,
    data.campaign_id,
  );
  if (campaign.status !== 200 || !campaign.data) return FAIL;
  return {
    status: 200,
    data: {
      id: data.id,
      campaignId: data.campaign_id,
      status: data.status as ContentCampaignCheckout["status"],
      totalPrice: Number(data.total_price),
      currency: data.currency,
      expiresAt: data.expires_at,
      summaryLabel: summaryLabel(
        campaign.data.budgetMinor,
        campaign.data.durationDays,
        data.currency,
      ),
      estimatedReachLow: campaign.data.estimatedReachLow,
      estimatedReachHigh: campaign.data.estimatedReachHigh,
      postCaption:
        (
          data.content_campaign as {
            content_post?: { caption: string | null } | null;
          } | null
        )?.content_post?.caption ?? null,
      campaign: campaign.data,
    },
  };
}

export async function getContentCampaignCore(
  supabase: ServiceRoleClient,
  userId: string,
  campaignId: string,
): Promise<Envelope<ContentCampaign>> {
  const { data, error } = await supabase
    .from("content_campaign")
    .select(CAMPAIGN_SELECT)
    .eq("id", campaignId)
    .eq("advertiser_id", userId)
    .maybeSingle();
  if (error) {
    logger.error(`getContentCampaignCore failed: ${error.message}`);
    return FAIL;
  }
  if (!data) return { status: 404, message: "Campaign not found." };
  const campaign = mapCampaign(withTargeting(data as never));
  campaign.metrics = await loadCampaignMetrics(supabase, campaignId);
  return { status: 200, data: campaign };
}

export async function loadCampaignMetrics(
  supabase: ServiceRoleClient,
  campaignId: string,
): Promise<ContentCampaignMetrics | null> {
  const { data, error } = await supabase.rpc("content_campaign_metrics", {
    p_campaign_id: campaignId,
  });
  if (error) {
    logger.error(`content_campaign_metrics failed: ${error.message}`);
    return null;
  }
  return (data as unknown as ContentCampaignMetrics | null) ?? null;
}

/** "GH₵50 budget · up to 7 days", in the campaign's own currency. */
export function summaryLabel(
  budgetMinor: number,
  durationDays: number,
  currency: string,
): string {
  const amount = formatMoney(
    { amountMinor: budgetMinor, currency },
    { trimZeroFraction: true },
  );
  return `${amount} budget · up to ${durationDays} day${durationDays === 1 ? "" : "s"}`;
}

// PostgREST returns the geography column as WKB hex; the same parser the
// alerts service uses turns it back into a point.
function withTargeting<T extends { targeting_location?: unknown }>(
  row: T,
): T & { targeting_lat: number | null; targeting_lng: number | null } {
  const raw = row.targeting_location;
  if (typeof raw !== "string" || raw.length < 42) {
    return { ...row, targeting_lat: null, targeting_lng: null };
  }
  try {
    const { eventLat, eventLng } = parseWKBHex(raw);
    return {
      ...row,
      targeting_lat: Number.isFinite(eventLat) ? eventLat : null,
      targeting_lng: Number.isFinite(eventLng) ? eventLng : null,
    };
  } catch {
    return { ...row, targeting_lat: null, targeting_lng: null };
  }
}

export async function listOwnContentCampaignsCore(
  supabase: ServiceRoleClient,
  userId: string,
): Promise<Envelope<ContentCampaign[]>> {
  const { data, error } = await supabase
    .from("content_campaign")
    .select(CAMPAIGN_SELECT)
    .eq("advertiser_id", userId)
    .neq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    logger.error(`listOwnContentCampaignsCore failed: ${error.message}`);
    return FAIL;
  }
  return {
    status: 200,
    data: (data ?? []).map((r) => mapCampaign(withTargeting(r as never))),
  };
}

export async function getContentCampaignHistoryCore(
  supabase: ServiceRoleClient,
  campaignId: string,
): Promise<{
  events: ContentCampaignEvent[];
  ledger: ContentCampaignLedgerEntry[];
}> {
  const [events, ledger] = await Promise.all([
    supabase
      .from("content_campaign_event")
      .select("id, actor_kind, from_status, to_status, reason, created_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true }),
    supabase
      .from("content_campaign_ledger")
      .select("id, entry_type, amount_minor, currency, note, created_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true }),
  ]);
  return {
    events: (events.data ?? []).map((e) => ({
      id: e.id,
      actorKind: e.actor_kind as ContentCampaignEvent["actorKind"],
      fromStatus: e.from_status,
      toStatus: e.to_status,
      reason: e.reason,
      createdAt: e.created_at,
    })),
    ledger: (ledger.data ?? []).map((l) => ({
      id: l.id,
      entryType: l.entry_type as ContentCampaignLedgerEntry["entryType"],
      amountMinor: Number(l.amount_minor),
      currency: l.currency,
      note: l.note,
      createdAt: l.created_at,
    })),
  };
}

/** pause / resume / cancel by the advertiser. */
export async function advertiserCampaignActionCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: {
    campaignId: string;
    action: "pause" | "resume" | "cancel";
    reason?: string;
  },
): Promise<Envelope<ContentCampaign>> {
  const { data: campaign } = await supabase
    .from("content_campaign")
    .select("id, advertiser_id, status, checkout_id")
    .eq("id", input.campaignId)
    .maybeSingle();
  if (!campaign || campaign.advertiser_id !== userId) {
    return { status: 404, message: "Campaign not found." };
  }
  // Cancelling an unpaid order goes through the checkout, so its pending
  // checkout can't still be paid afterwards (a charge against a cancelled
  // campaign could not be fulfilled), and never while a payment is in
  // flight.
  if (
    input.action === "cancel" &&
    campaign.checkout_id &&
    (campaign.status === "pending_payment" || campaign.status === "draft")
  ) {
    const res = await cancelPromotionCheckout(
      supabase,
      "content_campaign_checkout",
      "content_campaign_checkout_id",
      campaign.checkout_id,
      userId,
    );
    if (res.status !== 200) return { status: res.status, message: res.message };
    const { data: after } = await supabase
      .from("content_campaign")
      .select("status")
      .eq("id", campaign.id)
      .maybeSingle();
    if (after?.status !== "cancelled") {
      await supabase.rpc("content_campaign_transition", {
        p_campaign_id: campaign.id,
        p_to: "cancelled",
        p_actor_id: userId,
        p_actor_kind: "advertiser",
        p_reason: "Order cancelled before payment",
      });
    }
    return getContentCampaignCore(supabase, userId, input.campaignId);
  }
  const to =
    input.action === "pause"
      ? "paused"
      : input.action === "resume"
        ? "active"
        : "cancelled";
  const { error } = await supabase.rpc("content_campaign_transition", {
    p_campaign_id: input.campaignId,
    p_to: to,
    p_actor_id: userId,
    p_actor_kind: "advertiser",
    p_reason: (input.reason ?? null) as unknown as string,
  });
  if (error) {
    if (error.code === "22023") return { status: 409, message: error.message };
    logger.error(`advertiserCampaignActionCore failed: ${error.message}`);
    return FAIL;
  }
  if (to === "cancelled") {
    await notifyCampaign(supabase, {
      id: input.campaignId,
      advertiserId: userId,
      status: "cancelled",
      reason: "Any unspent budget can be refunded by our team.",
    });
  }
  return getContentCampaignCore(supabase, userId, input.campaignId);
}
