import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const pushed: { userId: string; title: string }[] = [];
vi.mock("../notifications/sendPushNotification", () => ({
  sendPushToUser: async (userId: string, payload: { title: string }) => {
    pushed.push({ userId, title: payload.title });
    return "sent";
  },
}));

import { createNotificationCore } from "../notifications/createNotification";
import { deliverQueuedNotificationsCore } from "../notifications/deliveryCore";
import { markNotificationReadFor } from "../notifications/notificationsQuery";
import {
  getNotificationPreferencesCore,
  updateNotificationPreferencesCore,
} from "../notifications/preferencesCore";
import {
  getPromptOfferCore,
  markPromptShownCore,
  respondToPromptCore,
} from "../notifications/promptCore";
import {
  dismissRecommendationCore,
  listRecommendationsCore,
} from "../notifications/recommendationsCore";
import {
  getSubscriptionStatusCore,
  listSubscriptionsCore,
  subscribeCore,
  unsubscribeCore,
} from "../notifications/subscriptionCore";
import { resetDiscoverySettingsCache } from "../search/discoveryProgram";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Opt-in personalisation end to end against a real local stack (migrations
// 20260913090300 + 20260913090400): who may subscribe to what, the prompt
// rules, candidate generation and suppression, the one-a-day digest and its
// caps, shadow mode, send-time opt-outs, "Not interested", the For-you list
// and the social push switch. Transactional notices must keep pushing.

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

type SettingsRow =
  Database["public"]["Tables"]["discovery_program_setting"]["Row"];

const svc = getServiceClient() as unknown as ServiceRoleClient;
const LAT = 5.6037;
const LNG = -0.187;
const CATEGORY = "Arts, Culture & Theatre";

let organizer: TestUser;
let fan: TestUser;
let other: TestUser;
let original: SettingsRow;
const users: TestUser[] = [];
const eventIds: string[] = [];

async function setSettings(patch: Partial<SettingsRow>) {
  const { error } = await svc
    .from("discovery_program_setting")
    .update(patch as never)
    .eq("id", 1);
  expect(error).toBeNull();
  resetDiscoverySettingsCache();
}

async function makeEvent(
  title: string,
  opts: { organizerId?: string; startsInHours?: number; lng?: number } = {},
) {
  const startsAt = new Date(
    Date.now() + (opts.startsInHours ?? 72) * 3_600_000,
  );
  const { data, error } = await svc.rpc("create_event", {
    p_client_request_id: crypto.randomUUID(),
    p_organizer_id: opts.organizerId ?? organizer.id,
    p_title: title,
    p_slug: `${title.toLowerCase().replace(/\W+/g, "-")}-${crypto.randomUUID()}`,
    p_description: "A personalisation integration test event.",
    p_event_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
    p_event_category: CATEGORY,
    p_event_type: ["Drama & Theatre Shows"],
    p_latitude: LAT,
    p_longitude: opts.lng ?? LNG,
    p_address: { full_address: "National Theatre, Accra, Ghana" },
    p_capacity: 100,
    p_website_url: null,
    p_flyer_public_id: "test/flyer",
    p_flyer_version: "1",
    p_starts_at: startsAt.toISOString(),
    p_ends_at: new Date(startsAt.getTime() + 3 * 3_600_000).toISOString(),
    p_require_registration: false,
    p_featured: false,
    p_specific_dates: null,
    p_ticket_types: [
      {
        type: "General",
        price: 0,
        currency: "GHS",
        quantity: 50,
        available_from: null,
        available_until: null,
      },
    ],
    p_promo_codes: null,
    p_receiving_account: null,
    p_place_id: null,
  } as unknown as Database["public"]["Functions"]["create_event"]["Args"]);
  if (error || !data) throw new Error(`create_event failed: ${error?.message}`);
  const id = data as unknown as string;
  eventIds.push(id);
  await svc.from("event").update({ status: "published" }).eq("id", id);
  return id;
}

/** The generator only takes events published at least five minutes ago. */
async function ageEvents(ids: string[], minutes = 10) {
  await svc
    .from("event")
    .update({
      published_at: new Date(Date.now() - minutes * 60_000).toISOString(),
    } as never)
    .in("id", ids);
}

async function attend(userId: string, eventId: string) {
  const { error } = await svc.from("attendance").insert({
    user_id: userId,
    event_id: eventId,
    number_of_tickets: 1,
    status: "attending",
  } as never);
  expect(error).toBeNull();
}

async function newUser(): Promise<TestUser> {
  const u = await createTestUser(getServiceClient());
  users.push(u);
  return u;
}

beforeAll(async () => {
  organizer = await newUser();
  fan = await newUser();
  other = await newUser();
  await svc
    .from("user_info")
    .update({ username: `org_${Date.now().toString(36)}` })
    .eq("id", organizer.id);
  const { data } = await svc
    .from("discovery_program_setting")
    .select("*")
    .eq("id", 1)
    .single();
  original = data as SettingsRow;
});

afterAll(async () => {
  await svc
    .from("discovery_program_setting")
    .update(original as never)
    .eq("id", 1);
  resetDiscoverySettingsCache();
  if (eventIds.length) await svc.from("event").delete().in("id", eventIds);
  for (const u of users) await deleteTestUser(getServiceClient(), u.id);
});

beforeEach(async () => {
  await setSettings({
    recommendations_enabled: true,
    recommendations_shadow_mode: false,
    recommendations_audience: "all",
    prompts_enabled: true,
    beta_user_ids: [],
    daily_push_cap: 1,
    weekly_push_cap: 3,
    prompt_cooldown_days: 7,
    prompt_dismiss_days: 30,
    prompt_max_shows: 3,
    generate_watermark: new Date(Date.now() - 60 * 60_000).toISOString(),
  });
});

describe("subscriptions", () => {
  it("are refused while personalisation is off or the person is outside the audience", async () => {
    await makeEvent("Gate Check Play");
    await setSettings({ recommendations_enabled: false });
    const off = await subscribeCore(
      svc,
      fan.id,
      { kind: "organizer", organizerId: organizer.id },
      "profile",
    );
    expect(off.status).toBe(403);

    await setSettings({
      recommendations_enabled: true,
      recommendations_audience: "beta",
      beta_user_ids: [other.id],
    });
    const outside = await subscribeCore(
      svc,
      fan.id,
      { kind: "organizer", organizerId: organizer.id },
      "profile",
    );
    expect(outside.status).toBe(403);
  });

  it("follow an organizer, dedupe similar-event topics, list with labels and unsubscribe", async () => {
    const play = await makeEvent("Topic Play One");
    const play2 = await makeEvent("Topic Play Two", { lng: LNG + 0.001 });

    const self = await subscribeCore(
      svc,
      organizer.id,
      { kind: "organizer", organizerId: organizer.id },
      "profile",
    );
    expect(self.status).toBe(400);

    const follow = await subscribeCore(
      svc,
      fan.id,
      { kind: "organizer", organizerId: organizer.id },
      "profile",
    );
    expect(follow.status).toBe(200);
    const again = await subscribeCore(
      svc,
      fan.id,
      { kind: "organizer", organizerId: organizer.id },
      "profile",
    );
    expect(again.data?.subscriptionId).toBe(follow.data?.subscriptionId);

    const topic1 = await subscribeCore(
      svc,
      fan.id,
      { kind: "similar_events", eventId: play },
      "purchase_prompt",
    );
    const topic2 = await subscribeCore(
      svc,
      fan.id,
      { kind: "similar_events", eventId: play2 },
      "purchase_prompt",
    );
    expect(topic1.status).toBe(200);
    expect(topic2.data?.subscriptionId).toBe(topic1.data?.subscriptionId);

    const status = await getSubscriptionStatusCore(
      svc,
      fan.id,
      "organizer",
      organizer.id,
    );
    expect(status.data?.subscribed).toBe(true);

    const list = await listSubscriptionsCore(svc, fan.id);
    const labels = (list.data ?? []).map((s) => s.label);
    expect(labels.some((l) => l.startsWith("@org_"))).toBe(true);
    expect(labels).toContain(`${CATEGORY} events near Accra`);

    // Somebody else cannot turn it off.
    const stranger = await unsubscribeCore(
      svc,
      other.id,
      follow.data?.subscriptionId as string,
    );
    expect(stranger.status).toBe(404);

    const off = await unsubscribeCore(
      svc,
      fan.id,
      follow.data?.subscriptionId as string,
    );
    expect(off.status).toBe(200);
    expect(
      (await getSubscriptionStatusCore(svc, fan.id, "organizer", organizer.id))
        .data?.subscribed,
    ).toBe(false);

    // Resubscribing reactivates the same row.
    const back = await subscribeCore(
      svc,
      fan.id,
      { kind: "organizer", organizerId: organizer.id },
      "settings",
    );
    expect(back.data?.subscriptionId).toBe(follow.data?.subscriptionId);
    await unsubscribeCore(svc, fan.id, follow.data?.subscriptionId as string);
    await unsubscribeCore(svc, fan.id, topic1.data?.subscriptionId as string);
  });

  it("are readable only by their owner and writable by nobody but the service", async () => {
    const own = await fan.client
      .from("notification_subscription")
      .select("id, user_id");
    expect(own.error).toBeNull();
    expect((own.data ?? []).every((r) => r.user_id === fan.id)).toBe(true);

    const leak = await other.client
      .from("notification_subscription")
      .select("id")
      .eq("user_id", fan.id);
    expect(leak.data ?? []).toHaveLength(0);

    const insert = await fan.client.from("notification_subscription").insert({
      user_id: fan.id,
      kind: "organizer",
      target_id: organizer.id,
      source: "profile",
    } as never);
    expect(insert.error).not.toBeNull();

    for (const table of [
      "recommendation",
      "recommendation_digest",
      "discovery_program_setting",
      "notification_preference",
    ] as const) {
      const r = await fan.client.from(table).select("*").limit(1);
      expect(r.error?.code, table).toBe("42501");
    }
  });
});

describe("opt-in prompts", () => {
  it("offer only after a real ticket, honour Not now, and create subscriptions on accept", async () => {
    const buyer = await newUser();
    const event = await makeEvent("Prompt Play");

    const before = await getPromptOfferCore(svc, buyer.id, {
      context: "purchase",
      eventId: event,
    });
    expect(before.data?.similarEvents).toBeNull();

    await attend(buyer.id, event);
    const offer = await getPromptOfferCore(svc, buyer.id, {
      context: "purchase",
      eventId: event,
    });
    expect(offer.data?.similarEvents?.category).toBe(CATEGORY);
    expect(offer.data?.similarEvents?.locality).toBe("Accra");
    expect(offer.data?.organizer?.organizerId).toBe(organizer.id);

    const shown = await markPromptShownCore(svc, buyer.id, {
      context: "purchase",
      eventId: event,
    });
    expect(shown.data?.recorded).toBe(true);
    // A re-render of the same card still shows it.
    expect(
      (
        await getPromptOfferCore(svc, buyer.id, {
          context: "purchase",
          eventId: event,
        })
      ).data?.similarEvents,
    ).not.toBeNull();

    const dismissed = await respondToPromptCore(svc, buyer.id, {
      context: { context: "purchase", eventId: event },
      response: "dismissed",
    });
    expect(dismissed.status).toBe(200);
    expect(
      (
        await getPromptOfferCore(svc, buyer.id, {
          context: "purchase",
          eventId: event,
        })
      ).data?.similarEvents,
    ).toBeNull();

    // Somebody else accepts only the similar-events part.
    const keen = await newUser();
    await attend(keen.id, event);
    const accepted = await respondToPromptCore(svc, keen.id, {
      context: { context: "purchase", eventId: event },
      response: "accepted",
      accept: { similarEvents: true, organizer: false },
    });
    expect(accepted.status).toBe(200);
    expect(accepted.data?.subscribed).toEqual(["similar_events"]);
    const subs = await listSubscriptionsCore(svc, keen.id);
    expect((subs.data ?? []).map((s) => s.kind)).toEqual(["similar_events"]);
    expect((subs.data ?? [])[0].source).toBe("purchase_prompt");

    // Already subscribed: no second similar-events prompt; organizer line is
    // not offered alone.
    const event2 = await makeEvent("Prompt Play Two");
    await attend(keen.id, event2);
    await svc
      .from("notification_prompt_state")
      .update({
        last_shown_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      } as never)
      .eq("user_id", keen.id);
    const second = await getPromptOfferCore(svc, keen.id, {
      context: "purchase",
      eventId: event2,
    });
    expect(second.data?.similarEvents).toBeNull();
    expect(second.data?.organizer).toBeNull();
  });

  it("show at most one prompt a week and nothing when prompts are off", async () => {
    const person = await newUser();
    const a = await makeEvent("Cooldown Play A");
    const b = await makeEvent("Cooldown Play B", { organizerId: other.id });
    await attend(person.id, a);
    await attend(person.id, b);
    await markPromptShownCore(svc, person.id, {
      context: "purchase",
      eventId: a,
    });
    const blocked = await getPromptOfferCore(svc, person.id, {
      context: "rsvp",
      eventId: b,
    });
    // Another event's card within the week is blocked entirely.
    expect(blocked.data?.organizer).toBeNull();
    expect(blocked.data?.similarEvents).toBeNull();
    // The card already on screen keeps showing.
    expect(
      (
        await getPromptOfferCore(svc, person.id, {
          context: "purchase",
          eventId: a,
        })
      ).data?.similarEvents,
    ).not.toBeNull();

    await setSettings({ prompts_enabled: false });
    const off = await getPromptOfferCore(svc, person.id, {
      context: "purchase",
      eventId: a,
    });
    expect(off.data?.similarEvents).toBeNull();
  });

  it("require a second visit before offering place updates", async () => {
    const visitor = await newUser();
    const { data: place } = await svc
      .from("place")
      .insert({
        owner_id: organizer.id,
        name: "Prompt Test Lounge",
        slug: `prompt-test-lounge-${crypto.randomUUID()}`,
        description: "Integration test place",
        category_id: 1,
        location: `SRID=4326;POINT(${LNG} ${LAT})`,
        address: { full_address: "Osu, Accra" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
      } as never)
      .select("id")
      .single();
    const placeId = place?.id as string;
    const ctx = {
      context: "place" as const,
      placeId,
      trigger: "visit" as const,
    };
    await svc.from("place_visit").insert({
      place_id: placeId,
      user_id: visitor.id,
      visited_on: new Date(Date.now() - 3 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      distance_m: 10,
      platform: "android",
    } as never);
    expect(
      (await getPromptOfferCore(svc, visitor.id, ctx)).data?.place,
    ).toBeNull();
    await svc.from("place_visit").insert({
      place_id: placeId,
      user_id: visitor.id,
      visited_on: new Date().toISOString().slice(0, 10),
      distance_m: 10,
      platform: "android",
    } as never);
    const offer = await getPromptOfferCore(svc, visitor.id, ctx);
    expect(offer.data?.place?.name).toBe("Prompt Test Lounge");

    const accepted = await respondToPromptCore(svc, visitor.id, {
      context: ctx,
      response: "accepted",
      accept: { place: true },
    });
    expect(new Set(accepted.data?.subscribed)).toEqual(
      new Set(["place", "similar_places"]),
    );

    // The owner is never prompted about their own place.
    expect(
      (
        await getPromptOfferCore(svc, organizer.id, {
          ...ctx,
          trigger: "favorite",
        })
      ).data?.place,
    ).toBeNull();
    await svc.from("place").delete().eq("id", placeId);
  });
});

describe("recommendation engine", () => {
  it("generates candidates, suppresses what the person already has, and builds one capped digest", async () => {
    const follower = await newUser();
    const lover = await newUser();
    const attendee = await newUser();
    await subscribeCore(
      svc,
      follower.id,
      { kind: "organizer", organizerId: organizer.id },
      "profile",
    );
    const seed = await makeEvent("Seed Play");
    for (const u of [lover, attendee]) {
      await subscribeCore(
        svc,
        u.id,
        { kind: "similar_events", eventId: seed },
        "purchase_prompt",
      );
    }
    await ageEvents([seed], 20);
    await svc.rpc("recommendations_generate", { p_limit: 1000 });
    await svc
      .from("recommendation")
      .delete()
      .in("user_id", [follower.id, lover.id, attendee.id]);

    const fresh = await makeEvent("Fresh Premiere");
    const fresh2 = await makeEvent("Fresh Premiere Encore", {
      startsInHours: 96,
    });
    await attend(attendee.id, fresh);
    await ageEvents([fresh, fresh2], 7);

    const gen = await svc.rpc("recommendations_generate", { p_limit: 1000 });
    expect(gen.error).toBeNull();
    const again = await svc.rpc("recommendations_generate", { p_limit: 1000 });
    expect((again.data as { inserted: number }).inserted).toBe(0);

    const { data: recs } = await svc
      .from("recommendation")
      .select(
        "user_id, subject_id, reason_kind, status, suppress_reason, is_shadow",
      )
      .in("user_id", [follower.id, lover.id, attendee.id, organizer.id]);
    const of = (u: string, e: string) =>
      (recs ?? []).find((r) => r.user_id === u && r.subject_id === e);
    expect(of(follower.id, fresh)?.reason_kind).toBe("organizer");
    expect(of(lover.id, fresh)?.reason_kind).toBe("similar_events");
    expect(of(attendee.id, fresh)?.status).toBe("suppressed");
    expect(of(attendee.id, fresh)?.suppress_reason).toBe("attending");
    expect((recs ?? []).some((r) => r.user_id === organizer.id)).toBe(false);
    expect((recs ?? []).every((r) => !r.is_shadow)).toBe(true);

    const digest = await svc.rpc("recommendations_build_digest", {
      p_limit: 50000,
      p_force: true,
    });
    expect(digest.error).toBeNull();

    const { data: notices } = await svc
      .from("notification")
      .select("id, user_id, title, body, link, data")
      .eq("type", "recommendation_digest")
      .in("user_id", [follower.id, lover.id]);
    expect(notices ?? []).toHaveLength(2);
    const loverNotice = (notices ?? []).find((n) => n.user_id === lover.id);
    expect(loverNotice?.title).toBe("2 picks for you");
    expect(loverNotice?.link).toBe("/for-you");
    const payload = loverNotice?.data as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["digestId", "kind"]);

    const { data: deliveries } = await svc
      .from("notification_delivery")
      .select("source, urgent, status")
      .in(
        "notification_id",
        (notices ?? []).map((n) => n.id),
      );
    expect(
      (deliveries ?? []).every(
        (d) => d.source === "recommendations" && !d.urgent,
      ),
    ).toBe(true);

    // One digest a day.
    await svc.rpc("recommendations_build_digest", {
      p_limit: 50000,
      p_force: true,
    });
    const { count } = await svc
      .from("notification")
      .select("id", { count: "exact", head: true })
      .eq("type", "recommendation_digest")
      .eq("user_id", lover.id);
    expect(count).toBe(1);

    // For you shows live picks; a tap counts as opened; "Not interested" works.
    const forYou = await listRecommendationsCore(svc, lover.id);
    expect((forYou.data ?? []).map((i) => i.subjectId).sort()).toEqual(
      [fresh, fresh2].sort(),
    );
    expect(forYou.data?.[0]?.reasonLabel).toBe(`Because you like ${CATEGORY}`);

    await markNotificationReadFor(
      lover.client,
      lover.id,
      loverNotice?.id as string,
    );
    const { data: opened } = await svc
      .from("recommendation_digest")
      .select("opened_at")
      .eq("user_id", lover.id)
      .single();
    expect(opened?.opened_at).not.toBeNull();

    const dismissed = await dismissRecommendationCore(svc, lover.id, {
      subjectType: "event",
      subjectId: fresh2,
    });
    expect(dismissed.data?.dismissed).toBe(true);
    expect(
      (await listRecommendationsCore(svc, lover.id)).data?.map(
        (i) => i.subjectId,
      ),
    ).not.toContain(fresh2);
  });

  it("skips queued pushes at send time when the person opts out or pauses", async () => {
    const person = await newUser();
    await subscribeCore(
      svc,
      person.id,
      { kind: "organizer", organizerId: organizer.id },
      "profile",
    );
    const e = await makeEvent("Opt Out Premiere");
    await ageEvents([e]);
    await setSettings({
      generate_watermark: new Date(Date.now() - 11 * 60_000).toISOString(),
    } as Partial<SettingsRow>);
    await svc.rpc("recommendations_generate", { p_limit: 1000 });
    await svc.rpc("recommendations_build_digest", {
      p_limit: 50000,
      p_force: true,
    });

    const { data: notice } = await svc
      .from("notification")
      .select("id")
      .eq("type", "recommendation_digest")
      .eq("user_id", person.id)
      .single();
    expect(notice?.id).toBeTruthy();

    const off = await updateNotificationPreferencesCore(svc, person.id, {
      organizerAlertsPush: false,
    });
    expect(off.status).toBe(200);
    const run = await deliverQueuedNotificationsCore({
      sendEmail: async () => ({ ok: true }),
      sendPush: async () => "sent",
    });
    expect(run.status).toBe(200);
    const { data: delivery } = await svc
      .from("notification_delivery")
      .select("status, detail")
      .eq("notification_id", notice?.id as string)
      .single();
    expect(delivery?.status).toBe("skipped");
    expect(delivery?.detail).toBe("opted_out");
    const { data: rec } = await svc
      .from("recommendation")
      .select("status")
      .eq("user_id", person.id)
      .eq("subject_id", e)
      .single();
    expect(rec?.status).toBe("candidate");

    const paused = await updateNotificationPreferencesCore(svc, person.id, {
      pause: "two_weeks",
    });
    expect(paused.data?.pausedUntil).not.toBeNull();
    const resumed = await updateNotificationPreferencesCore(svc, person.id, {
      pause: "resume",
    });
    expect(resumed.data?.pausedUntil).toBeNull();
    const prefs = await getNotificationPreferencesCore(svc, person.id);
    expect(prefs.data?.organizerAlertsPush).toBe(false);
    expect(prefs.data?.recommendationsPush).toBe(true);
  });

  it("enforces the weekly cap", async () => {
    const person = await newUser();
    await subscribeCore(
      svc,
      person.id,
      { kind: "organizer", organizerId: organizer.id },
      "profile",
    );
    const today = new Date();
    for (let d = 1; d <= 3; d++) {
      await svc.from("recommendation_digest").insert({
        user_id: person.id,
        digest_date: new Date(today.getTime() - d * 86_400_000)
          .toISOString()
          .slice(0, 10),
        is_shadow: false,
        item_count: 1,
        top_subject_type: "event",
        top_subject_id: crypto.randomUUID(),
        delivery_status: "sent",
        opened_at: new Date().toISOString(),
      } as never);
    }
    const e = await makeEvent("Weekly Cap Premiere");
    await ageEvents([e]);
    await setSettings({
      generate_watermark: new Date(Date.now() - 11 * 60_000).toISOString(),
    } as Partial<SettingsRow>);
    await svc.rpc("recommendations_generate", { p_limit: 1000 });
    await svc.rpc("recommendations_build_digest", {
      p_limit: 50000,
      p_force: true,
    });
    const { data: skips } = await svc
      .from("recommendation_digest_skip")
      .select("reason")
      .eq("user_id", person.id);
    expect((skips ?? []).map((s) => s.reason)).toContain("weekly_cap");
    const { count } = await svc
      .from("notification")
      .select("id", { count: "exact", head: true })
      .eq("user_id", person.id)
      .eq("type", "recommendation_digest");
    expect(count).toBe(0);
  });

  it("builds the day's digests in batches without repeating anyone", async () => {
    const first = await newUser();
    const second = await newUser();
    const capped = await newUser();
    for (const u of [first, second, capped]) {
      await subscribeCore(
        svc,
        u.id,
        { kind: "organizer", organizerId: organizer.id },
        "profile",
      );
    }
    const today = new Date();
    for (let d = 1; d <= 3; d++) {
      await svc.from("recommendation_digest").insert({
        user_id: capped.id,
        digest_date: new Date(today.getTime() - d * 86_400_000)
          .toISOString()
          .slice(0, 10),
        is_shadow: false,
        item_count: 1,
        top_subject_type: "event",
        top_subject_id: crypto.randomUUID(),
        delivery_status: "sent",
        opened_at: new Date().toISOString(),
      } as never);
    }
    const e = await makeEvent("Batched Premiere");
    await ageEvents([e]);
    await setSettings({
      generate_watermark: new Date(Date.now() - 11 * 60_000).toISOString(),
    } as Partial<SettingsRow>);
    await svc.rpc("recommendations_generate", { p_limit: 1000 });

    // One person per run, until nobody is left for today.
    let runs = 0;
    for (; runs < 500; runs++) {
      const { data, error } = await svc.rpc("recommendations_build_digest", {
        p_limit: 1,
        p_force: true,
      });
      expect(error).toBeNull();
      const users = (data as { users: number }).users;
      expect(users).toBeLessThanOrEqual(1);
      if (users === 0) break;
    }
    expect(runs).toBeLessThan(500);

    for (const u of [first, second]) {
      const { count } = await svc
        .from("notification")
        .select("id", { count: "exact", head: true })
        .eq("user_id", u.id)
        .eq("type", "recommendation_digest");
      expect(count).toBe(1);
    }
    const { data: skips } = await svc
      .from("recommendation_digest_skip")
      .select("reason")
      .eq("user_id", capped.id);
    expect((skips ?? []).map((s) => s.reason)).toEqual(["weekly_cap"]);
  });

  it("in shadow mode records projections and sends nothing", async () => {
    await setSettings({ recommendations_shadow_mode: true });
    const person = await newUser();
    await subscribeCore(
      svc,
      person.id,
      { kind: "organizer", organizerId: organizer.id },
      "profile",
    );
    const e = await makeEvent("Shadow Premiere");
    await ageEvents([e]);
    await setSettings({
      generate_watermark: new Date(Date.now() - 11 * 60_000).toISOString(),
    } as Partial<SettingsRow>);
    await svc.rpc("recommendations_generate", { p_limit: 1000 });
    await svc.rpc("recommendations_build_digest", {
      p_limit: 50000,
      p_force: true,
    });

    const { data: rec } = await svc
      .from("recommendation")
      .select("is_shadow, status, digest_id")
      .eq("user_id", person.id)
      .eq("subject_id", e)
      .single();
    expect(rec?.is_shadow).toBe(true);
    expect(rec?.status).toBe("shadow");
    expect(rec?.digest_id).not.toBeNull();
    const { count } = await svc
      .from("notification")
      .select("id", { count: "exact", head: true })
      .eq("user_id", person.id)
      .eq("type", "recommendation_digest");
    expect(count).toBe(0);
    expect((await listRecommendationsCore(svc, person.id)).data).toHaveLength(
      0,
    );

    const metrics = await svc.rpc("admin_recommendation_metrics", {
      p_days: 1,
    });
    const m = metrics.data as { digestsDaily: { shadow: number }[] };
    expect(m.digestsDaily.some((d) => d.shadow > 0)).toBe(true);
  });

  it("pauses a subscription after three dismissals", async () => {
    const person = await newUser();
    const sub = await subscribeCore(
      svc,
      person.id,
      { kind: "organizer", organizerId: organizer.id },
      "profile",
    );
    const ids = [
      await makeEvent("Dismiss One"),
      await makeEvent("Dismiss Two"),
      await makeEvent("Dismiss Three"),
    ];
    await ageEvents(ids);
    await setSettings({
      generate_watermark: new Date(Date.now() - 11 * 60_000).toISOString(),
    } as Partial<SettingsRow>);
    await svc.rpc("recommendations_generate", { p_limit: 1000 });
    let last: Awaited<ReturnType<typeof dismissRecommendationCore>> | null =
      null;
    for (const id of ids)
      last = await dismissRecommendationCore(svc, person.id, {
        subjectType: "event",
        subjectId: id,
      });
    expect(last?.data?.paused).toBe(true);
    const { data: row } = await svc
      .from("notification_subscription")
      .select("status")
      .eq("id", sub.data?.subscriptionId as string)
      .single();
    expect(row?.status).toBe("paused");
  });
});

describe("social push switch", () => {
  it("mutes message pushes but never transactional ones, and always writes the in-app row", async () => {
    const person = await newUser();
    await updateNotificationPreferencesCore(svc, person.id, {
      socialPush: false,
    });
    pushed.length = 0;

    await createNotificationCore(svc, {
      userId: person.id,
      type: "message",
      title: "New message",
    });
    await createNotificationCore(svc, {
      userId: person.id,
      type: "ticket_confirmed",
      title: "Ticket confirmed",
    });

    expect(pushed.map((p) => p.title)).toEqual(["Ticket confirmed"]);
    const { count } = await svc
      .from("notification")
      .select("id", { count: "exact", head: true })
      .eq("user_id", person.id);
    expect(count).toBe(2);
  });
});
