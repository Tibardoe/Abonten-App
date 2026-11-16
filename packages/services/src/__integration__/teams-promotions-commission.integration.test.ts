import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Team accounts, stage 5 (docs/architecture/team-accounts.md §4i): an Owner
// pays to promote the team's Spotlight with their own card (the campaign is
// the team's, the checkout theirs, the team's activity names them, the
// notices go to those who pay for promotion); the reward engine never pays a
// team's own people on its own events (X36); a member is not offered a
// share of their team's event.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import activateContentCampaign from "../content/campaigns/activateContentCampaignCore";
import {
  advertiserCampaignActionCore,
  createContentCampaignCore,
  getContentCampaignCheckoutCore,
} from "../content/campaigns/contentCampaignCore";
import { createContentPostCore } from "../content/contentPostCore";
import {
  getContentProgramCore,
  resetContentSettingsCache,
} from "../content/contentProgram";
import { getEventPromoterOfferCore } from "../rewards/promoterCommissionCore";
import {
  answerTeamInviteCore,
  createTeamCore,
  inviteTeamMemberCore,
} from "../teams/teamCore";
import { resetTeamSettingsCache } from "../teams/teamProgram";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

type SettingsRow =
  Database["public"]["Tables"]["content_program_setting"]["Row"];
type PricingRow =
  Database["public"]["Tables"]["content_promotion_pricing"]["Row"];

const noText = { canTextNumber: async () => false };

describe("promotion and promoter commission as a team", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];
  let owner: TestUser;
  let content: TestUser;
  let finance: TestUser;
  let outsider: TestUser;
  let teamId: string;
  let placeId: string;
  let eventId: string;
  let settings: SettingsRow;
  let pricing: PricingRow;
  const postIds: string[] = [];

  async function person(): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    await service
      .from("user_info")
      .update({ username: `tp_${u.id.slice(0, 8)}`, full_name: "Promo Person" })
      .eq("id", u.id);
    return u;
  }

  async function join(who: TestUser, role: "content" | "finance") {
    const sent = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role,
        target: { kind: "username", username: `tp_${who.id.slice(0, 8)}` },
      },
      noText,
    );
    if (sent.status !== 200) throw new Error(sent.message);
    const res = await answerTeamInviteCore(svc, who.id, {
      inviteId: sent.data.id,
      action: "accept",
    });
    if (res.status !== 200) throw new Error(res.message);
  }

  async function teamSpotlight(by: TestUser) {
    const token = crypto.randomUUID().replace(/-/g, "");
    const { data: media } = await service
      .from("content_media")
      .insert({
        owner_id: by.id,
        media_type: "image",
        public_id: `content_media/development/${by.id}/tp_${token}`,
        version: 1,
        bytes: 1000,
        width: 720,
        height: 1280,
        media_url: `https://res.cloudinary.com/demo/image/upload/tp_${token}`,
        thumbnail_url: `https://res.cloudinary.com/demo/image/upload/tp_${token}.jpg`,
        status: "ready",
        playback_status: "none",
      } as never)
      .select("id")
      .single();
    const res = await createContentPostCore(
      svc,
      by.id,
      {
        kind: "spotlight",
        publisher: { kind: "organizer", placeId: null },
        mediaIds: [(media as { id: string }).id],
        caption: `Team promo ${token.slice(0, 6)}`,
        hashtags: [],
        eventId: null,
        placeId: null,
        allowComments: true,
        allowDownload: false,
        rightsAcknowledged: true,
        publish: true,
      },
      teamId,
    );
    if (res.status !== 200 || !res.data) throw new Error(res.message);
    postIds.push(res.data.id);
    return res.data.id;
  }

  beforeAll(async () => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
    const [{ data: s }, { data: p }] = await Promise.all([
      service.from("content_program_setting").select("*").eq("id", 1).single(),
      service
        .from("content_promotion_pricing")
        .select("*")
        .eq("id", 1)
        .single(),
    ]);
    settings = s as SettingsRow;
    pricing = p as PricingRow;
    await service
      .from("content_program_setting")
      .update({
        spotlight_enabled: true,
        spotlight_audience: "all",
        spotlight_posting_enabled: true,
        spotlight_promotions_enabled: true,
        creator_posting_enabled: true,
      } as never)
      .eq("id", 1);
    await service
      .from("content_promotion_pricing")
      .update({
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
      } as never)
      .eq("id", 1);
    resetContentSettingsCache();
    await service
      .from("team_program_setting")
      .update({ enabled: true, audience: "all" })
      .eq("id", 1);
    resetTeamSettingsCache();

    owner = await person();
    [content, finance, outsider] = await Promise.all([
      person(),
      person(),
      person(),
    ]);
    const made = await createTeamCore(svc, owner.id, {
      name: "Promo Crew",
      username: `tpt_${crypto.randomUUID().slice(0, 8)}`,
    });
    if (made.status !== 200) throw new Error(made.message);
    teamId = made.data.id;
    await join(content, "content");
    await join(finance, "finance");

    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    const { data: place, error } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: teamId,
        name: "Promo Rooftop",
        slug: `promo-rooftop-${crypto.randomUUID()}`,
        description: "Run by a team.",
        category_id: category?.id as number,
        location: "POINT(-0.187 5.6037)",
        address: { city: "Accra", country: "Ghana" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
      } as never)
      .select("id")
      .single();
    if (error || !place) throw new Error(error?.message);
    placeId = (place as { id: string }).id;
    ({ eventId } = await createTestEventWithTicketType(service, owner.id, {
      quantity: 10,
    }));
    await service
      .from("event")
      .update({ organizer_id: teamId } as never)
      .eq("id", eventId);
  });

  afterAll(async () => {
    await service
      .from("content_program_setting")
      .update(settings as never)
      .eq("id", 1);
    await service
      .from("content_promotion_pricing")
      .update(pricing as never)
      .eq("id", 1);
    resetContentSettingsCache();
    await service
      .from("team_program_setting")
      .update({ enabled: false })
      .eq("id", 1);
    resetTeamSettingsCache();
    // A campaign keeps its ledger, so its post and advertiser stay: take
    // the posts out of every feed instead.
    if (postIds.length) {
      await service
        .from("content_post")
        .update({ status: "deleted" } as never)
        .in("id", postIds);
    }
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await service.from("place").delete().eq("id", placeId);
    await service.from("notification").delete().eq("user_id", teamId);
    await service.auth.admin.deleteUser(teamId).catch(() => undefined);
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("opens paid promotion of the team's Spotlights to those who post and pay", async () => {
    const asOwner = await getContentProgramCore(svc, owner.id, {
      publisherId: teamId,
      canPromote: true,
    });
    expect(asOwner.data.spotlightPromotions).toBe(true);
    // Content and messages post but do not pay.
    const asContent = await getContentProgramCore(svc, content.id, {
      publisherId: teamId,
      canPromote: false,
    });
    expect(asContent.data.spotlightPosting).toBe(true);
    expect(asContent.data.spotlightPromotions).toBe(false);
  });

  it("lets an Owner pay to promote the team's Spotlight; the campaign is the team's", async () => {
    const postId = await teamSpotlight(content);
    const made = await createContentCampaignCore(
      svc,
      teamId,
      {
        postId,
        budgetMinor: 5000,
        durationDays: 7,
        objective: "views",
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        targeting: { area: "everywhere" },
      },
      owner.id,
    );
    expect(made.status, made.message).toBe(200);
    const { campaign, checkout } = made.data as NonNullable<typeof made.data>;
    expect(campaign.advertiserId).toBe(teamId);
    const { data: ck } = await service
      .from("content_campaign_checkout")
      .select("owner_id")
      .eq("id", checkout.id)
      .single();
    expect(ck?.owner_id).toBe(owner.id);

    // The payer reads their checkout, with the team's campaign on it.
    const seen = await getContentCampaignCheckoutCore(
      svc,
      owner.id,
      checkout.id,
    );
    expect(seen.status).toBe(200);
    expect(seen.data?.campaign.advertiserId).toBe(teamId);
    // Nobody else does.
    const other = await getContentCampaignCheckoutCore(
      svc,
      finance.id,
      checkout.id,
    );
    expect(other.status).toBe(404);

    // Pay it (a verified charge on the payer's attempt) and activate.
    const { data: tx } = await service
      .from("transaction")
      .insert({
        user_id: owner.id,
        full_name: "Promo Person",
        email: owner.email,
        reason: "Promotion_Purchase",
        amount: checkout.totalPrice,
        currency: "GHS",
        status: "successful",
        payment_method: "paystack",
        provider: "paystack",
        provider_reference: `IT-TEAMPROMO-${crypto.randomUUID()}`,
      } as never)
      .select("id")
      .single();
    const txId = (tx as { id: string }).id;
    const { error: attemptError } = await service
      .from("payment_attempt")
      .insert({
        user_id: owner.id,
        amount: checkout.totalPrice,
        currency: "GHS",
        provider: "paystack",
        provider_reference: `IT-TEAMPROMO-ATT-${crypto.randomUUID()}`,
        status: "succeeded",
        content_campaign_checkout_id: checkout.id,
        transaction_id: txId,
      } as never);
    expect(attemptError).toBeNull();
    const activated = await activateContentCampaign(checkout.id, {
      userId: owner.id,
    } as never);
    expect(activated.status, activated.message).toBe(200);

    const { data: row } = await service
      .from("content_campaign")
      .select("status, advertiser_id")
      .eq("id", campaign.id)
      .single();
    expect(row).toEqual({ status: "pending_review", advertiser_id: teamId });
    const { data: bought } = await service
      .from("team_activity")
      .select("actor_user_id")
      .eq("team_id", teamId)
      .eq("action", "content_promotion_bought")
      .eq("subject_id", campaign.id)
      .single();
    expect(bought?.actor_user_id).toBe(owner.id);

    // The notice goes to those who pay for promotion (Owners, Finance),
    // not to everyone who posts.
    const told = async (userId: string) =>
      (
        await service
          .from("notification")
          .select("id")
          .eq("user_id", userId)
          .eq("type", "content_campaign")
      ).data?.length ?? 0;
    expect(await told(owner.id)).toBeGreaterThan(0);
    expect(await told(finance.id)).toBeGreaterThan(0);
    expect(await told(content.id)).toBe(0);

    // Another member who may pay cancels it for the team; the activity
    // names them.
    const cancelled = await advertiserCampaignActionCore(
      svc,
      teamId,
      { campaignId: campaign.id, action: "cancel", reason: "Changed plans" },
      owner.id,
    );
    expect(cancelled.status, cancelled.message).toBe(200);
    const { data: cancelLog } = await service
      .from("team_activity")
      .select("actor_user_id")
      .eq("team_id", teamId)
      .eq("action", "content_promotion_cancel")
      .eq("subject_id", campaign.id)
      .single();
    expect(cancelLog?.actor_user_id).toBe(owner.id);
  });

  it("never pays a team's own people on its events (X36)", async () => {
    const linked = async (user: string) =>
      (
        await service.rpc(
          "_reward_organizer_linked" as never,
          {
            p_organizer: teamId,
            p_user: user,
          } as never,
        )
      ).data;
    expect(await linked(content.id)).toBe(true);
    expect(await linked(teamId)).toBe(true);
    expect(await linked(outsider.id)).toBe(false);

    // A member is not offered a share of their team's event; others may be.
    await service
      .from("event_promoter_commission")
      .upsert({ event_id: eventId, rate_bps: 1000, is_active: true } as never, {
        onConflict: "event_id",
      });
    const forMember = await getEventPromoterOfferCore(
      service,
      eventId,
      content.id,
    );
    expect(forMember).toEqual({ status: 200, data: null });
    await service
      .from("event_promoter_commission")
      .delete()
      .eq("event_id", eventId);
  });
});
