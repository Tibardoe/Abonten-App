import { estimatePromotionReach } from "@abonten/core/content/promotionEstimate";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { createContentCampaignSchema } from "@abonten/validation/contentSchemas";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cancelPromotionCheckout } from "../checkout/checkoutCancellation";
import {
  advertiserCampaignActionCore,
  createContentCampaignCore,
  getContentCampaignCore,
} from "../content/campaigns/contentCampaignCore";
import {
  estimateContentPromotionCore,
  readPromotionAudience,
  readPromotionPricing,
} from "../content/campaigns/contentPromotionCore";
import { getContentFeedCore } from "../content/contentFeedCore";
import {
  createContentPostCore,
  deleteContentPostCore,
} from "../content/contentPostCore";
import { resetContentSettingsCache } from "../content/contentProgram";
import { ingestContentViewsCore } from "../content/contentTelemetryCore";
import { insertPlacePromotionCheckoutCore } from "../places/placePromotionCore";
import { insertEventPromotionCheckoutCore } from "../promotions/insertEventPromotionCheckoutCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Reach-based Spotlight promotions (migration 20260916130000) against a real
// local stack: server-side pricing and estimates, the price snapshot, the
// payment-amount check, spend that follows delivered impressions, the goal
// and run-end stops, refunds exactly once, sponsored placement in the feed
// (rotation, caps, switches, targeting, never the advertiser's own, never a
// hidden post), the advertiser/staff pause guard, and the promotion
// checkout cancellation regression for event, place and Spotlight orders.

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

type SettingsRow =
  Database["public"]["Tables"]["content_program_setting"]["Row"];
type PricingRow =
  Database["public"]["Tables"]["content_promotion_pricing"]["Row"];

const svc = getServiceClient() as unknown as ServiceRoleClient;
const IP = { ip: "198.51.100.23" };

let organizer: TestUser;
let viewer: TestUser;
let viewer2: TestUser;
let stranger: TestUser;
let originalSettings: SettingsRow;
let originalPricing: PricingRow;
let eventId: string;
const postIds: string[] = [];
const placeIds: string[] = [];
const txIds: string[] = [];

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error("Expected a value");
  return value;
}

async function setSettings(patch: Partial<SettingsRow>) {
  const { error } = await svc
    .from("content_program_setting")
    .update(patch as never)
    .eq("id", 1);
  expect(error).toBeNull();
  resetContentSettingsCache();
}

async function setPricing(patch: Partial<PricingRow>) {
  const { error } = await svc
    .from("content_promotion_pricing")
    .update(patch as never)
    .eq("id", 1);
  expect(error).toBeNull();
}

async function publishPost(
  extra: { eventId?: string | null; ageDays?: number } = {},
) {
  const token = crypto.randomUUID().replace(/-/g, "");
  const { data: media } = await svc
    .from("content_media")
    .insert({
      owner_id: organizer.id,
      media_type: "image",
      public_id: `content_media/development/${organizer.id}/promo_${token}`,
      version: 1,
      bytes: 1000,
      width: 720,
      height: 1280,
      media_url: `https://res.cloudinary.com/demo/image/upload/promo_${token}`,
      thumbnail_url: `https://res.cloudinary.com/demo/image/upload/promo_${token}.jpg`,
      status: "ready",
      playback_status: "none",
    } as never)
    .select("id")
    .single();
  const res = await createContentPostCore(svc, organizer.id, {
    kind: "spotlight",
    publisher: { kind: "organizer", placeId: null },
    mediaIds: [must(media).id as string],
    caption: `Promo IT ${token.slice(0, 6)}`,
    hashtags: [],
    eventId: extra.eventId ?? null,
    placeId: null,
    allowComments: true,
    allowDownload: false,
    rightsAcknowledged: true,
    publish: true,
  });
  expect(res.status, res.message).toBe(200);
  const id = must(res.data).id;
  postIds.push(id);
  if (extra.ageDays) {
    await svc
      .from("content_post")
      .update({
        published_at: new Date(
          Date.now() - extra.ageDays * 86_400_000,
        ).toISOString(),
      } as never)
      .eq("id", id);
  }
  return id;
}

async function startCampaign(
  postId: string,
  budgetMinor = 5000,
  targeting:
    | { area: "everywhere" }
    | { area: "near_post"; radiusKm: number } = {
    area: "everywhere",
  },
) {
  const res = await createContentCampaignCore(svc, organizer.id, {
    postId,
    budgetMinor,
    durationDays: 7,
    objective: "views",
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    targeting,
  });
  expect(res.status, res.message).toBe(200);
  return must(res.data);
}

async function pay(checkoutId: string, amount: number) {
  const { data: tx } = await svc
    .from("transaction")
    .insert({
      user_id: organizer.id,
      full_name: "Organizer",
      email: organizer.email,
      reason: "Promotion_Purchase",
      amount,
      currency: "GHS",
      status: "successful",
      payment_method: "paystack",
      paystack_reference: `IT-PROMO-${crypto.randomUUID()}`,
    } as never)
    .select("id")
    .single();
  const txId = must(tx).id as string;
  txIds.push(txId);
  return svc.rpc("content_campaign_activate_from_checkout", {
    p_checkout_id: checkoutId,
    p_transaction_id: txId,
    p_user_id: organizer.id,
  } as never);
}

async function transition(
  campaignId: string,
  to: string,
  actor: "admin" | "advertiser" | "system",
  reason = "integration test",
) {
  return svc.rpc("content_campaign_transition", {
    p_campaign_id: campaignId,
    p_to: to,
    p_actor_id: actor === "advertiser" ? organizer.id : viewer.id,
    p_actor_kind: actor,
    p_reason: reason,
  } as never);
}

async function liveCampaign(postId: string, budgetMinor = 5000) {
  const { campaign, checkout } = await startCampaign(postId, budgetMinor);
  const paid = await pay(checkout.id, checkout.totalPrice);
  expect(paid.error).toBeNull();
  const approved = await transition(campaign.id, "active", "admin");
  expect(approved.error).toBeNull();
  return campaign.id;
}

async function campaignRow(id: string) {
  const { data } = await svc
    .from("content_campaign")
    .select("*")
    .eq("id", id)
    .single();
  return must(data);
}

async function impression(
  userId: string,
  viewerKey: string,
  postId: string,
  campaignId: string | null,
) {
  const res = await ingestContentViewsCore(
    svc,
    userId,
    {
      viewerKey,
      events: [
        {
          postId,
          kind: "impression",
          watchedMs: 0,
          surface: "for_you",
          campaignId,
        },
      ],
    } as never,
    IP,
  );
  expect(res.status).toBe(200);
  return must(res.data);
}

beforeAll(async () => {
  const [{ data: s }, { data: p }] = await Promise.all([
    svc.from("content_program_setting").select("*").eq("id", 1).single(),
    svc.from("content_promotion_pricing").select("*").eq("id", 1).single(),
  ]);
  originalSettings = must(s) as SettingsRow;
  originalPricing = must(p) as PricingRow;

  organizer = await createTestUser(svc as never);
  viewer = await createTestUser(svc as never);
  viewer2 = await createTestUser(svc as never);
  stranger = await createTestUser(svc as never);
  ({ eventId } = await createTestEventWithTicketType(
    svc as never,
    organizer.id,
    { quantity: 10 },
  ));
  await svc
    .from("event")
    .update({ status: "published" } as never)
    .eq("id", eventId);
  await svc.from("admin_user").upsert(
    [organizer, viewer, viewer2].map((u) => ({
      user_id: u.id,
      status: "active",
    })) as never,
  );
});

afterAll(async () => {
  await setSettings(originalSettings);
  await setPricing(originalPricing);
  await svc.from("content_audience_snapshot").update({
    daily_viewers: 0,
    reach_28d: 0,
  } as never);
  await svc.rpc("content_audience_refresh");
  await svc
    .from("admin_user")
    .delete()
    .in("user_id", [organizer.id, viewer.id, viewer2.id]);
  for (const id of placeIds) await svc.from("place").delete().eq("id", id);
  for (const u of [organizer, viewer, viewer2, stranger]) {
    await deleteTestUser(svc as never, u.id);
  }
});

beforeEach(async () => {
  await setSettings({
    spotlight_enabled: true,
    spotlight_audience: "staff",
    spotlight_posting_enabled: true,
    spotlight_promotions_enabled: true,
    sponsored_delivery_enabled: true,
    sponsored_max_share_bps: 5000,
    sponsored_min_gap: 1,
    sponsored_daily_cap_per_viewer: 3,
    feed_page_size: 5,
    spotlight_posts_per_day: 200,
    creator_posting_enabled: true,
  } as Partial<SettingsRow>);
  await setPricing({
    cpm_minor: 1100,
    avg_frequency: 1.5,
    min_budget_minor: 2000,
    max_budget_minor: 500000,
    budget_step_minor: 500,
    duration_options_days: [3, 7, 14],
    default_duration_days: 7,
    audience_floor_daily_viewers: 5000,
    audience_floor_reach: 20000,
    min_deliverable_bps: 5000,
  } as Partial<PricingRow>);
});

describe("pricing and estimates", () => {
  it("prices on the server exactly as the shared estimator does", async () => {
    const postId = await publishPost();
    const res = await estimateContentPromotionCore(svc, organizer.id, {
      postId,
      budgetMinor: 5000,
      durationDays: 7,
      targeting: { area: "everywhere" },
    });
    expect(res.status, res.message).toBe(200);
    const pricing = must(await readPromotionPricing(svc));
    const audience = await readPromotionAudience(svc);
    expect(res.data).toEqual(
      estimatePromotionReach({
        pricing,
        audience,
        dailyCapPerViewer: 3,
        budgetMinor: 5000,
        durationDays: 7,
        targeting: { radiusKm: null },
      }),
    );
    expect(must(res.data).impressionGoal).toBe(4545);
    expect(must(res.data).deliverable).toBe(true);
    expect(must(res.data).reachLow).toBeGreaterThan(0);

    // A location target estimates the audience within the chosen distance.
    const nearPost = await publishPost({ eventId });
    const near = async (radiusKm: number) => {
      const r = await estimateContentPromotionCore(svc, organizer.id, {
        postId: nearPost,
        budgetMinor: 50000,
        durationDays: 3,
        targeting: { area: "near_post", radiusKm },
      });
      expect(r.status, r.message).toBe(200);
      expect(r.data).toEqual(
        estimatePromotionReach({
          pricing,
          audience,
          dailyCapPerViewer: 3,
          budgetMinor: 50000,
          durationDays: 3,
          targeting: { radiusKm },
        }),
      );
      return must(r.data);
    };
    const [r5, r50] = [await near(5), await near(50)];
    expect(r5.estimatedImpressions).toBeLessThan(r50.estimatedImpressions);
  });

  it("refuses other people's posts, bad budgets, bad run lengths and a location it doesn't have", async () => {
    const postId = await publishPost();
    const base = {
      postId,
      budgetMinor: 5000,
      durationDays: 7,
      targeting: { area: "everywhere" as const },
    };
    expect(
      (await estimateContentPromotionCore(svc, viewer.id, base)).status,
    ).toBe(403);
    expect(
      (
        await estimateContentPromotionCore(svc, organizer.id, {
          ...base,
          budgetMinor: 5250,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await estimateContentPromotionCore(svc, organizer.id, {
          ...base,
          durationDays: 5,
        })
      ).status,
    ).toBe(400);
    // No event or place attached, so no location to target around.
    expect(
      (
        await estimateContentPromotionCore(svc, organizer.id, {
          ...base,
          targeting: { area: "near_post", radiusKm: 10 },
        })
      ).status,
    ).toBe(400);
    await setSettings({ spotlight_promotions_enabled: false });
    expect(
      (await estimateContentPromotionCore(svc, organizer.id, base)).status,
    ).toBe(403);
  });

  it("stops selling when promotions are killed at the deploy level", async () => {
    const postId = await publishPost();
    process.env.SPOTLIGHT_PROMOTIONS_KILL_SWITCH = "true";
    try {
      const res = await createContentCampaignCore(svc, organizer.id, {
        postId,
        budgetMinor: 5000,
        durationDays: 7,
        objective: "views",
        startsAt: new Date().toISOString(),
        targeting: { area: "everywhere" },
      });
      expect(res.status).toBe(403);
    } finally {
      Reflect.deleteProperty(process.env, "SPOTLIGHT_PROMOTIONS_KILL_SWITCH");
    }
  });

  it("refuses to sell when reach can't be estimated", async () => {
    const postId = await publishPost();
    await setPricing({
      audience_floor_daily_viewers: 0,
      audience_floor_reach: 0,
    } as Partial<PricingRow>);
    const audience = await readPromotionAudience(svc);
    // Only meaningful while the local stack has no measured audience.
    if (audience.dailyViewers === 0) {
      const res = await createContentCampaignCore(svc, organizer.id, {
        postId,
        budgetMinor: 5000,
        durationDays: 7,
        objective: "views",
        startsAt: new Date().toISOString(),
        targeting: { area: "everywhere" },
      });
      expect(res.status).toBe(409);
      expect(res.message).toMatch(/can't estimate/);
    }
  });

  it("ignores estimate fields a client adds and snapshots the price", async () => {
    const parsed = createContentCampaignSchema.parse({
      postId: crypto.randomUUID(),
      budgetMinor: 5000,
      durationDays: 7,
      objective: "views",
      startsAt: new Date().toISOString(),
      targeting: { area: "everywhere" },
      impressionGoal: 999_999,
      cpmMinor: 1,
      estimatedReachHigh: 1_000_000,
    });
    expect(parsed).not.toHaveProperty("impressionGoal");
    expect(parsed).not.toHaveProperty("cpmMinor");

    const postId = await publishPost();
    const { campaign, checkout } = await startCampaign(postId, 5000);
    expect(campaign.budgetMinor).toBe(5000);
    expect(campaign.cpmMinor).toBe(1100);
    expect(campaign.impressionGoal).toBe(4545);
    expect(checkout.totalPrice).toBe(50);
    expect(campaign.estimatedReachHigh).toBeGreaterThan(0);

    const before = await campaignRow(campaign.id);
    await setPricing({ cpm_minor: 2200, version: 99 } as Partial<PricingRow>);
    const after = await campaignRow(campaign.id);
    expect(after.cpm_minor).toBe(before.cpm_minor);
    expect(after.impression_goal).toBe(before.impression_goal);
    expect(after.pricing_version).toBe(before.pricing_version);
  });
});

describe("payment and delivery billing", () => {
  it("refuses a payment that doesn't match the budget, then activates once", async () => {
    const postId = await publishPost();
    const { campaign, checkout } = await startCampaign(postId, 5000);
    const short = await pay(checkout.id, 10);
    expect(short.error?.code).toBe("22023");
    expect((await campaignRow(campaign.id)).status).toBe("pending_payment");

    const ok = await pay(checkout.id, 50);
    expect(ok.error).toBeNull();
    const row = await campaignRow(campaign.id);
    expect(row.status).toBe("pending_review");
    expect(Number(row.paid_minor)).toBe(5000);

    // The advertiser can never approve their own promotion.
    expect(
      (await transition(campaign.id, "active", "advertiser")).error,
    ).not.toBeNull();
  });

  it("charges per delivered impression, counts reach once per device and stops at the goal", async () => {
    // GH₵ 5,000 per 1,000 impressions: GH₵ 20 buys exactly 4 impressions.
    await setPricing({ cpm_minor: 500000 } as Partial<PricingRow>);
    const postId = await publishPost();
    const campaignId = await liveCampaign(postId, 2000);
    expect(Number((await campaignRow(campaignId)).impression_goal)).toBe(4);

    const key = (n: string) => `it-promo-device-${n}-${campaignId}`;
    expect(
      (await impression(viewer.id, key("a"), postId, campaignId)).accepted,
    ).toBe(1);
    // Same device again within the hour: not counted, not charged.
    expect(
      (await impression(viewer.id, key("a"), postId, campaignId)).invalid,
    ).toBe(1);
    await impression(viewer2.id, key("b"), postId, campaignId);
    let row = await campaignRow(campaignId);
    expect(row.impression_count).toBe(2);
    expect(row.reach_count).toBe(2);

    await svc.rpc("content_campaign_accrue", {
      p_campaign_id: campaignId,
    } as never);
    row = await campaignRow(campaignId);
    expect(Number(row.spent_minor)).toBe(1000);

    // The advertiser's own views never count.
    expect(
      (await impression(organizer.id, key("own"), postId, campaignId)).invalid,
    ).toBe(1);

    await impression(viewer.id, key("c"), postId, campaignId);
    await impression(viewer2.id, key("d"), postId, campaignId);
    await impression(viewer.id, key("e"), postId, campaignId);
    row = await campaignRow(campaignId);
    expect(row.impression_count).toBe(4);
    expect(row.reach_count).toBe(4);

    const tick = await svc.rpc("content_campaign_tick");
    expect(tick.error).toBeNull();
    row = await campaignRow(campaignId);
    expect(row.status).toBe("completed");
    expect(row.end_reason).toBe("budget_delivered");
    expect(Number(row.spent_minor)).toBe(2000);
    const { data: refundable } = await svc.rpc(
      "content_campaign_refundable_minor",
      { p_campaign_id: campaignId } as never,
    );
    expect(Number(refundable)).toBe(0);

    const metrics = must(
      (await getContentCampaignCore(svc, organizer.id, campaignId)).data,
    ).metrics;
    expect(metrics?.impressions).toBe(4);
    expect(metrics?.reach).toBe(4);
    expect(metrics?.deliveryBps).toBe(10000);

    const reconcile = await svc.rpc("content_campaign_reconcile");
    const counts = reconcile.data as {
      overspent: number;
      ledger_drift: number;
    };
    expect(counts.overspent).toBe(0);
    expect(counts.ledger_drift).toBe(0);
  });

  it("ends at the run limit with the unused budget refundable exactly once", async () => {
    const postId = await publishPost();
    const campaignId = await liveCampaign(postId, 5000);
    await impression(viewer.id, `it-run-end-${campaignId}`, postId, campaignId);
    await svc
      .from("content_campaign")
      .update({
        starts_at: new Date(Date.now() - 8 * 86_400_000).toISOString(),
        ends_at: new Date(Date.now() - 60_000).toISOString(),
      } as never)
      .eq("id", campaignId);
    await svc.rpc("content_campaign_tick");
    const row = await campaignRow(campaignId);
    expect(row.status).toBe("completed");
    expect(row.end_reason).toBe("run_ended");
    expect(Number(row.spent_minor)).toBe(1); // 1 impression × 1,100 / 1,000

    const { data: refundable } = await svc.rpc(
      "content_campaign_refundable_minor",
      { p_campaign_id: campaignId } as never,
    );
    expect(Number(refundable)).toBe(4999);

    const refund = (amount: number) =>
      svc.rpc("content_campaign_record_refund", {
        p_campaign_id: campaignId,
        p_amount_minor: amount,
        p_actor_id: viewer.id,
        p_reason: "integration test refund",
      } as never);
    expect((await refund(5000)).error?.code).toBe("22023");
    expect((await refund(4999)).error).toBeNull();
    const again = await refund(4999);
    expect((again.data as { replayed?: boolean } | null)?.replayed).toBe(true);
    const { data: ledger } = await svc
      .from("content_campaign_ledger")
      .select("amount_minor")
      .eq("campaign_id", campaignId)
      .eq("entry_type", "refund");
    expect(ledger).toHaveLength(1);
    expect((await campaignRow(campaignId)).status).toBe("refunded");

    const tamper = await svc
      .from("content_campaign_ledger")
      .delete()
      .eq("campaign_id", campaignId);
    expect(tamper.error).not.toBeNull();
  });

  it("never lets an advertiser lift a staff pause or resume on a hidden post", async () => {
    const postId = await publishPost();
    const campaignId = await liveCampaign(postId);

    expect(
      (await transition(campaignId, "paused", "admin", "policy check")).error,
    ).toBeNull();
    expect(
      (
        await advertiserCampaignActionCore(svc, organizer.id, {
          campaignId,
          action: "resume",
        })
      ).status,
    ).toBe(409);
    expect((await transition(campaignId, "active", "admin")).error).toBeNull();

    expect(
      (
        await advertiserCampaignActionCore(svc, organizer.id, {
          campaignId,
          action: "pause",
        })
      ).status,
    ).toBe(200);
    await svc
      .from("content_post")
      .update({ moderation_state: "hidden" } as never)
      .eq("id", postId);
    expect(
      (
        await advertiserCampaignActionCore(svc, organizer.id, {
          campaignId,
          action: "resume",
        })
      ).status,
    ).toBe(409);
    // A stranger can't touch it at all.
    expect(
      (
        await advertiserCampaignActionCore(svc, stranger.id, {
          campaignId,
          action: "cancel",
        })
      ).status,
    ).toBe(404);
    await svc
      .from("content_post")
      .update({ moderation_state: "visible" } as never)
      .eq("id", postId);
  });

  it("pauses a live promotion when its post is removed", async () => {
    const postId = await publishPost();
    const campaignId = await liveCampaign(postId);
    await svc
      .from("content_post")
      .update({ moderation_state: "removed" } as never)
      .eq("id", postId);
    await svc.rpc("content_campaign_tick");
    const row = await campaignRow(campaignId);
    expect(row.status).toBe("paused");
    expect(row.pause_source).toBe("system");
  });
});

describe("sponsored placement", () => {
  // Earlier runs against the same local stack may have left promotions
  // running; they would compete for the slots these tests measure.
  beforeEach(async () => {
    const { data } = await svc
      .from("content_campaign")
      .select("id")
      .in("status", ["scheduled", "active", "paused"]);
    for (const row of data ?? []) {
      await transition(row.id, "cancelled", "admin", "test isolation");
    }
  });

  async function feedFor(
    user: TestUser,
    viewerKey: string,
    extra: { cursor?: string | null; lat?: number; lng?: number } = {},
  ) {
    const res = await getContentFeedCore(
      svc,
      user.id,
      { surface: "for_you", viewerKey, ...extra } as never,
      IP,
    );
    expect(res.status, res.message).toBe(200);
    return must(res.data);
  }

  it("places a low-ranked promoted post in a labelled slot without repeating it", async () => {
    const promoted = await publishPost({ ageDays: 40 });
    // Enough fresh organic posts to fill the first page.
    for (let i = 0; i < 6; i += 1) await publishPost();
    const campaignId = await liveCampaign(promoted);

    const key = `it-place-${campaignId}`;
    const page1 = await feedFor(viewer, key);
    const sponsored = page1.items.filter((i) => i.sponsored);
    expect(sponsored).toHaveLength(1);
    expect(sponsored[0].post.id).toBe(promoted);
    expect(sponsored[0].sponsored?.campaignId).toBe(campaignId);
    // Not also on the page as an organic post, and never the first slot.
    expect(page1.items.filter((i) => i.post.id === promoted)).toHaveLength(1);
    expect(page1.items[0].sponsored).toBeNull();

    // Later pages never show it again, sponsored or organic.
    let cursor = page1.nextCursor;
    for (let n = 0; n < 12 && cursor; n += 1) {
      const next = await feedFor(viewer, key, { cursor });
      expect(next.items.some((i) => i.post.id === promoted)).toBe(false);
      cursor = next.nextCursor;
    }

    // Never shown to the advertiser.
    const own = await feedFor(organizer, `it-own-${campaignId}`);
    expect(own.items.some((i) => i.sponsored)).toBe(false);
  });

  it("disappears when paused, hidden, switched off or killed, and respects the daily cap", async () => {
    const promoted = await publishPost({ ageDays: 40 });
    for (let i = 0; i < 6; i += 1) await publishPost();
    const campaignId = await liveCampaign(promoted);
    const has = async (key: string) =>
      (await feedFor(viewer2, key)).items.some(
        (i) => i.sponsored?.campaignId === campaignId,
      );

    expect(await has(`it-sw-1-${campaignId}`)).toBe(true);

    await setSettings({ sponsored_delivery_enabled: false });
    expect(await has(`it-sw-2-${campaignId}`)).toBe(false);
    await setSettings({ sponsored_delivery_enabled: true });

    process.env.SPOTLIGHT_PROMOTIONS_KILL_SWITCH = "true";
    try {
      expect(await has(`it-sw-3-${campaignId}`)).toBe(false);
    } finally {
      Reflect.deleteProperty(process.env, "SPOTLIGHT_PROMOTIONS_KILL_SWITCH");
    }

    // One sponsored impression a day per device.
    await setSettings({ sponsored_daily_cap_per_viewer: 1 });
    const capped = `it-cap-${campaignId}`;
    expect(await has(capped)).toBe(true);
    await impression(viewer2.id, capped, promoted, campaignId);
    expect(await has(capped)).toBe(false);
    await setSettings({ sponsored_daily_cap_per_viewer: 3 });

    expect((await transition(campaignId, "paused", "admin")).error).toBeNull();
    expect(await has(`it-sw-4-${campaignId}`)).toBe(false);
    expect((await transition(campaignId, "active", "admin")).error).toBeNull();

    await svc
      .from("content_post")
      .update({ moderation_state: "hidden" } as never)
      .eq("id", promoted);
    expect(await has(`it-sw-5-${campaignId}`)).toBe(false);
    await svc
      .from("content_post")
      .update({ moderation_state: "visible" } as never)
      .eq("id", promoted);

    // Blocking the advertiser removes their promotion too.
    await svc
      .from("conversation_block")
      .insert({ blocker_id: viewer2.id, blocked_id: organizer.id } as never);
    const blocked = await has(`it-sw-6-${campaignId}`);
    await svc
      .from("conversation_block")
      .delete()
      .eq("blocker_id", viewer2.id)
      .eq("blocked_id", organizer.id);
    expect(blocked).toBe(false);

    await transition(campaignId, "cancelled", "admin", "test over");
  });

  it("rotates fairly between promotions and honours location targeting", async () => {
    const a = await publishPost({ ageDays: 40 });
    const b = await publishPost({ ageDays: 40, eventId });
    const campaignA = await liveCampaign(a);
    // B is shown only near the event (Accra, 5.6037, -0.187).
    const started = await startCampaign(b, 5000, {
      area: "near_post",
      radiusKm: 10,
    });
    expect((await pay(started.checkout.id, 50)).error).toBeNull();
    expect(
      (await transition(started.campaign.id, "active", "admin")).error,
    ).toBeNull();
    const campaignB = started.campaign.id;

    const candidates = (lat: number | null, lng: number | null, key: string) =>
      svc.rpc("content_sponsored_candidates", {
        p_viewer: viewer.id,
        p_viewer_key: key,
        p_lat: lat,
        p_lng: lng,
        p_limit: 10,
      } as never);

    const far = await candidates(9.4, -0.85, `it-geo-far-${campaignB}`);
    const farIds = (far.data as { campaign_id: string }[]).map(
      (c) => c.campaign_id,
    );
    expect(farIds).toContain(campaignA);
    expect(farIds).not.toContain(campaignB);
    const none = await candidates(null, null, `it-geo-none-${campaignB}`);
    expect(
      (none.data as { campaign_id: string }[]).map((c) => c.campaign_id),
    ).not.toContain(campaignB);

    // A promotion further ahead of its plan goes after one that is behind
    // (20 is still inside A's early pacing allowance of 1 % of 4,545).
    await svc
      .from("content_campaign")
      .update({ impression_count: 20 } as never)
      .eq("id", campaignA);
    const near = await candidates(5.6, -0.19, `it-geo-near-${campaignB}`);
    // Pacing: far ahead of plan, A is held back for now.
    await svc
      .from("content_campaign")
      .update({ impression_count: 4000 } as never)
      .eq("id", campaignA);
    const paced = await candidates(5.6, -0.19, `it-geo-paced-${campaignB}`);
    expect(
      (paced.data as { campaign_id: string }[]).map((c) => c.campaign_id),
    ).not.toContain(campaignA);
    const order = (near.data as { campaign_id: string }[])
      .map((c) => c.campaign_id)
      .filter((id) => id === campaignA || id === campaignB);
    expect(order).toEqual([campaignB, campaignA]);

    await transition(campaignA, "cancelled", "admin", "test over");
    await transition(campaignB, "cancelled", "admin", "test over");
  });
});

describe("promotion checkout cancellation", () => {
  it("lets the owner cancel an unpaid event promotion order, and nobody else", async () => {
    const created = await insertEventPromotionCheckoutCore(
      organizer.client,
      organizer.id,
      eventId,
      1,
    );
    expect(created.status).toBe(200);
    const checkoutId = (created as { checkoutId: string }).checkoutId;

    const byStranger = await cancelPromotionCheckout(
      stranger.client,
      "event_promotion_checkout",
      "event_promotion_checkout_id",
      checkoutId,
      stranger.id,
    );
    expect(byStranger.status).toBe(404);

    // Not while a payment is in flight.
    const { data: attempt } = await svc
      .from("payment_attempt")
      .insert({
        user_id: organizer.id,
        event_promotion_checkout_id: checkoutId,
        amount: 20,
        currency: "GHS",
        status: "pending",
        provider: "paystack",
        provider_reference: `IT-CANCEL-${crypto.randomUUID()}`,
      } as never)
      .select("id")
      .single();
    const inFlight = await cancelPromotionCheckout(
      organizer.client,
      "event_promotion_checkout",
      "event_promotion_checkout_id",
      checkoutId,
      organizer.id,
    );
    expect(inFlight.status).toBe(409);
    await svc
      .from("payment_attempt")
      .update({ status: "failed" } as never)
      .eq("id", must(attempt).id);

    const byOwner = await cancelPromotionCheckout(
      organizer.client,
      "event_promotion_checkout",
      "event_promotion_checkout_id",
      checkoutId,
      organizer.id,
    );
    expect(byOwner.status).toBe(200);
    const { data: row } = await svc
      .from("event_promotion_checkout")
      .select("status")
      .eq("id", checkoutId)
      .single();
    expect(must(row).status).toBe("cancelled");

    // A paid order is never flipped by a late cancel.
    const paid = await insertEventPromotionCheckoutCore(
      organizer.client,
      organizer.id,
      eventId,
      1,
    );
    const paidId = (paid as { checkoutId: string }).checkoutId;
    await svc
      .from("event_promotion_checkout")
      .update({ status: "paid" } as never)
      .eq("id", paidId);
    expect(
      (
        await cancelPromotionCheckout(
          organizer.client,
          "event_promotion_checkout",
          "event_promotion_checkout_id",
          paidId,
          organizer.id,
        )
      ).status,
    ).toBe(200);
    const { data: stillPaid } = await svc
      .from("event_promotion_checkout")
      .select("status")
      .eq("id", paidId)
      .single();
    expect(must(stillPaid).status).toBe("paid");
  });

  it("lets the owner cancel an unpaid place promotion order", async () => {
    const { data: place, error } = await svc
      .from("place")
      .insert({
        owner_id: organizer.id,
        name: "Promo Cancel Lounge",
        slug: `promo-cancel-lounge-${crypto.randomUUID()}`,
        description: "Integration test place",
        category_id: 1,
        location: "SRID=4326;POINT(-0.187 5.6037)",
        address: { full_address: "Osu, Accra" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
      } as never)
      .select("id")
      .single();
    expect(error).toBeNull();
    const placeId = must(place).id as string;
    placeIds.push(placeId);
    const created = await insertPlacePromotionCheckoutCore(
      organizer.client,
      organizer.id,
      placeId,
      1,
    );
    expect(created.status).toBe(200);
    const checkoutId = (created as { checkoutId: string }).checkoutId;
    expect(
      (
        await cancelPromotionCheckout(
          stranger.client,
          "place_promotion_checkout",
          "place_promotion_checkout_id",
          checkoutId,
          stranger.id,
        )
      ).status,
    ).toBe(404);
    const res = await cancelPromotionCheckout(
      organizer.client,
      "place_promotion_checkout",
      "place_promotion_checkout_id",
      checkoutId,
      organizer.id,
    );
    expect(res.status).toBe(200);
    const { data: row } = await svc
      .from("place_promotion_checkout")
      .select("status")
      .eq("id", checkoutId)
      .single();
    expect(must(row).status).toBe("cancelled");
  });

  it("cancels an unpaid Spotlight order and its campaign so the post can be promoted again", async () => {
    const postId = await publishPost();
    const { campaign, checkout } = await startCampaign(postId);
    const res = await cancelPromotionCheckout(
      organizer.client,
      "content_campaign_checkout",
      "content_campaign_checkout_id",
      checkout.id,
      organizer.id,
    );
    expect(res.status).toBe(200);
    expect((await campaignRow(campaign.id)).status).toBe("cancelled");
    const again = await startCampaign(postId);
    expect(again.campaign.status).toBe("pending_payment");
  });

  it("cancelling an unpaid promotion also closes its checkout, but not mid-payment", async () => {
    const postId = await publishPost();
    const { campaign, checkout } = await startCampaign(postId);
    const { data: attempt } = await svc
      .from("payment_attempt")
      .insert({
        user_id: organizer.id,
        content_campaign_checkout_id: checkout.id,
        amount: 50,
        currency: "GHS",
        status: "pending",
        provider: "paystack",
        provider_reference: `IT-INFLIGHT-${crypto.randomUUID()}`,
      } as never)
      .select("id")
      .single();
    const blocked = await advertiserCampaignActionCore(svc, organizer.id, {
      campaignId: campaign.id,
      action: "cancel",
    });
    expect(blocked.status).toBe(409);
    expect((await campaignRow(campaign.id)).status).toBe("pending_payment");

    await svc
      .from("payment_attempt")
      .update({ status: "failed" } as never)
      .eq("id", must(attempt).id);
    const ok = await advertiserCampaignActionCore(svc, organizer.id, {
      campaignId: campaign.id,
      action: "cancel",
    });
    expect(ok.status).toBe(200);
    expect((await campaignRow(campaign.id)).status).toBe("cancelled");
    const { data: ck } = await svc
      .from("content_campaign_checkout")
      .select("status")
      .eq("id", checkout.id)
      .single();
    expect(must(ck).status).toBe("cancelled");
  });

  it("cancels unpaid and running promotions when the Spotlight is deleted", async () => {
    const unpaidPost = await publishPost();
    const unpaid = await startCampaign(unpaidPost);
    expect(
      (await deleteContentPostCore(svc, organizer.id, unpaidPost)).status,
    ).toBe(200);
    expect((await campaignRow(unpaid.campaign.id)).status).toBe("cancelled");
    const { data: checkout } = await svc
      .from("content_campaign_checkout")
      .select("status")
      .eq("id", unpaid.checkout.id)
      .single();
    expect(must(checkout).status).toBe("cancelled");

    const livePost = await publishPost();
    const live = await liveCampaign(livePost);
    expect(
      (await deleteContentPostCore(svc, organizer.id, livePost)).status,
    ).toBe(200);
    expect((await campaignRow(live)).status).toBe("cancelled");
  });

  it("cancels a paid Spotlight promotion before or after approval, but not a finished one", async () => {
    const postId = await publishPost();
    const { campaign, checkout } = await startCampaign(postId);
    expect((await pay(checkout.id, checkout.totalPrice)).error).toBeNull();
    const inReview = await advertiserCampaignActionCore(svc, organizer.id, {
      campaignId: campaign.id,
      action: "cancel",
    });
    expect(inReview.status).toBe(200);
    expect((await campaignRow(campaign.id)).status).toBe("cancelled");
    // Cancelling again is harmless.
    expect(
      (
        await advertiserCampaignActionCore(svc, organizer.id, {
          campaignId: campaign.id,
          action: "cancel",
        })
      ).status,
    ).toBe(200);

    const post2 = await publishPost();
    const live = await liveCampaign(post2);
    expect(
      (
        await advertiserCampaignActionCore(svc, organizer.id, {
          campaignId: live,
          action: "cancel",
        })
      ).status,
    ).toBe(200);

    const post3 = await publishPost();
    const done = await liveCampaign(post3);
    await svc
      .from("content_campaign")
      .update({
        starts_at: new Date(Date.now() - 8 * 86_400_000).toISOString(),
        ends_at: new Date(Date.now() - 60_000).toISOString(),
      } as never)
      .eq("id", done);
    await svc.rpc("content_campaign_tick");
    expect((await campaignRow(done)).status).toBe("completed");
    expect(
      (
        await advertiserCampaignActionCore(svc, organizer.id, {
          campaignId: done,
          action: "cancel",
        })
      ).status,
    ).toBe(409);
  });
});
