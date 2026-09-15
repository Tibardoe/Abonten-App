import type { Database } from "@abonten/types/database.types";
import type { DiscoveryProgram } from "@abonten/types/discoveryType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const webPushSends: { endpoint: string; body: string }[] = [];
const goneEndpoints = new Set<string>();
vi.mock("web-push", () => ({
  default: {
    sendNotification: async (
      sub: { endpoint: string },
      body: string,
    ): Promise<void> => {
      if (goneEndpoints.has(sub.endpoint)) {
        throw Object.assign(new Error("Gone"), { statusCode: 410 });
      }
      webPushSends.push({ endpoint: sub.endpoint, body });
    },
  },
}));

import {
  type RecommendationEmail,
  deliverQueuedNotificationsCore,
} from "../notifications/deliveryCore";
import { updateNotificationPreferencesCore } from "../notifications/preferencesCore";
import { pollPushReceiptsCore } from "../notifications/pushReceiptsCore";
import {
  recommendationEmailUnsubscribeToken,
  setRecommendationEmailsByTokenCore,
} from "../notifications/recommendationEmailPreferenceCore";
import { sendPushToUser } from "../notifications/sendPushNotification";
import { subscribeCore } from "../notifications/subscriptionCore";
import {
  registerWebPushSubscriptionCore,
  sendWebPushToUser,
} from "../notifications/webPushCore";
import { resetDiscoverySettingsCache } from "../search/discoveryProgram";
import { recordSearchClickCore, suggestCore } from "../search/searchCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// The 2026-09-15 Discovery limitation fixes against a real local stack:
//   * place amenities (place_service) are searchable      20260915100000
//   * type-ahead is logged without identity               20260915100100
//   * Expo push receipts prune dead tokens; web push      20260915100200
//   * recommendation email, opt-in only, gated off         20260915100300

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
// Presence is all webPushCore checks; web-push itself is mocked above.
process.env.WEB_PUSH_VAPID_PUBLIC_KEY = "test-public-key";
process.env.WEB_PUSH_VAPID_PRIVATE_KEY = "test-private-key";
process.env.WEB_PUSH_SUBJECT = "mailto:test@example.test";

type SettingsRow =
  Database["public"]["Tables"]["discovery_program_setting"]["Row"];

const svc = getServiceClient() as unknown as ServiceRoleClient;
const anon = createClient<Database>(
  process.env.SUPABASE_TEST_URL as string,
  process.env.SUPABASE_TEST_ANON_KEY as string,
  { auth: { persistSession: false } },
);

const TOKEN = `zl${Date.now().toString(36)}`;
const LAT = 5.6037;
const LNG = -0.187;
const ON: DiscoveryProgram = {
  searchV2: true,
  organizerSearch: true,
  placeSearch: true,
  personalization: false,
  prompts: false,
  recommendationEmail: false,
};

let original: SettingsRow;
const users: TestUser[] = [];
const placeIds: string[] = [];
const eventIds: string[] = [];

async function newUser(): Promise<TestUser> {
  const u = await createTestUser(getServiceClient());
  users.push(u);
  return u;
}

async function setSettings(patch: Partial<SettingsRow>) {
  const { error } = await svc
    .from("discovery_program_setting")
    .update(patch as never)
    .eq("id", 1);
  expect(error).toBeNull();
  resetDiscoverySettingsCache();
}

async function makePlace(
  ownerId: string,
  name: string,
  status: "published" | "draft" = "published",
): Promise<string> {
  const { data, error } = await svc
    .from("place")
    .insert({
      owner_id: ownerId,
      name,
      slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${crypto.randomUUID()}`,
      description: "A place for the limitation fixes integration test.",
      category_id: 1,
      location: `SRID=4326;POINT(${LNG} ${LAT})`,
      address: { full_address: "Oxford Street, Osu, Accra" },
      cover_public_id: "test/cover",
      cover_version: "1",
      status,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(`place insert failed: ${error.message}`);
  placeIds.push(data.id);
  return data.id;
}

async function makeEvent(organizerId: string, title: string) {
  const startsAt = new Date(Date.now() + 72 * 3_600_000);
  const { data, error } = await svc.rpc("create_event", {
    p_client_request_id: crypto.randomUUID(),
    p_organizer_id: organizerId,
    p_title: title,
    p_slug: `${title.toLowerCase().replace(/\W+/g, "-")}-${crypto.randomUUID()}`,
    p_description: "A recommendation email integration test event.",
    p_event_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
    p_event_category: "Arts, Culture & Theatre",
    p_event_type: ["Drama & Theatre Shows"],
    p_latitude: LAT,
    p_longitude: LNG,
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
  await svc
    .from("event")
    .update({
      status: "published",
      published_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    } as never)
    .eq("id", id);
  return id;
}

/** Real fetch for Supabase; a canned answer for Expo's push API. */
function stubExpoFetch(answer: (init?: RequestInit) => Response) {
  const real = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      return url.startsWith("https://exp.host/")
        ? answer(init)
        : real(input, init);
    },
  );
}

/** An organizer with one long-published event, so they can be followed. */
async function newOrganizer(): Promise<TestUser> {
  const organizer = await newUser();
  const seed = await makeEvent(organizer.id, `${TOKEN} Seed Show`);
  await svc
    .from("event")
    .update({
      published_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    } as never)
    .eq("id", seed);
  return organizer;
}

beforeAll(async () => {
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
  vi.unstubAllGlobals();
  if (eventIds.length) await svc.from("event").delete().in("id", eventIds);
  if (placeIds.length) await svc.from("place").delete().in("id", placeIds);
  for (const u of users) await deleteTestUser(getServiceClient(), u.id);
});

describe("place amenities search", () => {
  it("finds a published place by a service it offers, below a name match", async () => {
    const owner = await newUser();
    const byService = await makePlace(owner.id, `Quiet Garden ${TOKEN}a`);
    const byName = await makePlace(owner.id, `${TOKEN}sauna House`);
    const hidden = await makePlace(owner.id, `Draft Spa ${TOKEN}b`, "draft");
    const { error } = await svc.from("place_service").insert([
      {
        place_id: byService,
        name: `${TOKEN}sauna and steam room`,
        description: "Open every evening",
      },
      { place_id: hidden, name: `${TOKEN}sauna` },
    ] as never);
    expect(error).toBeNull();

    const res = await anon.rpc("search_places", {
      p_query: `${TOKEN}sauna`,
      p_lat: LAT,
      p_lng: LNG,
    });
    expect(res.error).toBeNull();
    const ids = (res.data ?? []).map((p) => p.id);
    expect(ids).toContain(byService);
    expect(ids).toContain(byName);
    expect(ids).not.toContain(hidden);
    expect(ids.indexOf(byName)).toBeLessThan(ids.indexOf(byService));

    // Type-ahead reads the same pool.
    const suggest = await anon.rpc("search_suggest", {
      p_query: `${TOKEN}sauna`,
      p_types: ["place"],
    });
    expect((suggest.data ?? []).map((s) => s.id)).toContain(byService);

    // A description word of the service matches too.
    const byDescription = await anon.rpc("search_places", {
      p_query: `evening ${TOKEN}sauna`,
    });
    expect((byDescription.data ?? []).map((p) => p.id)).toContain(byService);
  });
});

describe("type-ahead logging", () => {
  it("records a suggestion request without identity and attributes the opened suggestion", async () => {
    const owner = await newUser();
    const place = await makePlace(owner.id, `${TOKEN}typeahead Lounge`);

    const res = await suggestCore(anon, { q: `${TOKEN}typeahead` }, ON, {
      platform: "ios",
      loggingEnabled: true,
    });
    expect(res.status).toBe(200);
    expect(res.places.map((p) => p.id)).toContain(place);
    expect(res.searchId).toBeGreaterThan(0);

    const { data: row } = await svc
      .from("search_query_log")
      .select("*")
      .eq("id", res.searchId as number)
      .single();
    expect(row?.surface).toBe("suggest");
    expect(row?.platform).toBe("ios");
    expect(row?.place_count).toBeGreaterThan(0);
    expect(Object.keys(row ?? {})).not.toContain("user_id");

    const click = await recordSearchClickCore(svc, {
      searchId: res.searchId as number,
      entityType: "place",
      entityId: place,
      rank: 0,
    });
    expect(click.status).toBe(200);

    // Logging off: nothing written.
    const quiet = await suggestCore(anon, { q: `${TOKEN}typeahead` }, ON, {
      platform: "web",
      loggingEnabled: false,
    });
    expect(quiet.searchId).toBeNull();

    const insights = await svc.rpc("admin_search_insights", { p_days: 1 });
    expect(insights.error).toBeNull();
    const data = insights.data as {
      topQueries: { query_norm: string }[];
      suggestions: {
        totals: { requests: number; opened: number };
        byPlatform: { platform: string }[];
      };
    };
    expect(data.suggestions.totals.requests).toBeGreaterThan(0);
    expect(data.suggestions.totals.opened).toBeGreaterThan(0);
    expect(data.suggestions.byPlatform.map((p) => p.platform)).toContain("ios");
    // Prefixes never leak into the submitted-search lists.
    expect(data.topQueries.map((q) => q.query_norm)).not.toContain(
      `${TOKEN}typeahead`,
    );
  });
});

describe("Expo push receipts", () => {
  it("records accepted tickets when sending", async () => {
    const person = await newUser();
    const token = `ExponentPushToken[${TOKEN}send]`;
    await svc
      .from("device_token")
      .insert({ user_id: person.id, token, platform: "android" });
    const ticketId = `ticket-${TOKEN}-send`;
    stubExpoFetch(() =>
      Response.json({ data: [{ status: "ok", id: ticketId }] }),
    );
    try {
      expect(await sendPushToUser(person.id, { title: "Hello" })).toBe("sent");
    } finally {
      vi.unstubAllGlobals();
    }
    const { data: row } = await svc
      .from("push_receipt")
      .select("token, check_after")
      .eq("ticket_id", ticketId)
      .single();
    expect(row?.token).toBe(token);
    expect(new Date(row?.check_after as string).getTime()).toBeGreaterThan(
      Date.now() + 10 * 60_000,
    );
    await svc.from("push_receipt").delete().eq("ticket_id", ticketId);
  });

  it("prunes tokens Apple or Google retired, clears read receipts and rechecks the rest", async () => {
    const person = await newUser();
    const dead = `ExponentPushToken[${TOKEN}dead]`;
    const alive = `ExponentPushToken[${TOKEN}alive]`;
    await svc.from("device_token").insert([
      { user_id: person.id, token: dead, platform: "android" },
      { user_id: person.id, token: alive, platform: "ios" },
    ]);
    const past = new Date(Date.now() - 60_000).toISOString();
    const ids = {
      ok: `r-${TOKEN}-ok`,
      dead: `r-${TOKEN}-dead`,
      notReady: `r-${TOKEN}-later`,
      tooBig: `r-${TOKEN}-big`,
    };
    await svc.from("push_receipt").insert([
      { ticket_id: ids.ok, token: alive, check_after: past },
      { ticket_id: ids.dead, token: dead, check_after: past },
      { ticket_id: ids.notReady, token: alive, check_after: past },
      { ticket_id: ids.tooBig, token: alive, check_after: past },
    ]);

    const requested: string[][] = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { ids: string[] };
      requested.push(body.ids);
      return Response.json({
        data: {
          [ids.ok]: { status: "ok" },
          [ids.dead]: {
            status: "error",
            message: "not registered",
            details: { error: "DeviceNotRegistered" },
          },
          [ids.tooBig]: {
            status: "error",
            message: "too big",
            details: { error: "MessageTooBig" },
          },
        },
      });
    }) as unknown as typeof fetch;

    const res = await pollPushReceiptsCore({ service: svc, fetchImpl });
    expect(res.status).toBe(200);
    expect(requested.flat()).toEqual(
      expect.arrayContaining(Object.values(ids)),
    );
    expect(res.data?.tokensRemoved).toBeGreaterThanOrEqual(1);

    const { data: tokens } = await svc
      .from("device_token")
      .select("token")
      .eq("user_id", person.id);
    expect((tokens ?? []).map((t) => t.token)).toEqual([alive]);

    const { data: left } = await svc
      .from("push_receipt")
      .select("ticket_id, check_after")
      .in("ticket_id", Object.values(ids));
    expect((left ?? []).map((r) => r.ticket_id)).toEqual([ids.notReady]);
    expect(
      new Date(left?.[0]?.check_after as string).getTime(),
    ).toBeGreaterThan(Date.now());
    await svc.from("push_receipt").delete().eq("ticket_id", ids.notReady);
  });

  it("backs off when Expo can't be reached instead of retrying every minute", async () => {
    const ticketId = `r-${TOKEN}-down`;
    await svc.from("push_receipt").insert({
      ticket_id: ticketId,
      token: `ExponentPushToken[${TOKEN}down]`,
      check_after: new Date(Date.now() - 60_000).toISOString(),
    });
    const res = await pollPushReceiptsCore({
      service: svc,
      fetchImpl: (async () =>
        new Response("unavailable", { status: 503 })) as typeof fetch,
    });
    expect(res.status).toBe(200);
    const { data } = await svc
      .from("push_receipt")
      .select("check_after")
      .eq("ticket_id", ticketId)
      .single();
    expect(new Date(data?.check_after as string).getTime()).toBeGreaterThan(
      Date.now() + 60_000,
    );
    await svc.from("push_receipt").delete().eq("ticket_id", ticketId);
  });

  it("is invisible to signed-in users", async () => {
    const person = await newUser();
    const read = await person.client.from("push_receipt").select("*").limit(1);
    expect(read.error?.code).toBe("42501");
  });
});

describe("web push", () => {
  const fcm = (suffix: string) =>
    `https://fcm.googleapis.com/fcm/send/${TOKEN}-${suffix}`;
  const keys = {
    p256dh:
      "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
    auth: "tBHItJI5svbpez7KI4CCXg",
  };

  it("stores only subscriptions on a known push service", async () => {
    const person = await newUser();
    const bad = await registerWebPushSubscriptionCore(
      person.id,
      { endpoint: "https://attacker.example/collect", keys },
      svc,
    );
    expect(bad.status).toBe(400);
    const http = await registerWebPushSubscriptionCore(
      person.id,
      { endpoint: "http://fcm.googleapis.com/fcm/send/x", keys },
      svc,
    );
    expect(http.status).toBe(400);

    const ok = await registerWebPushSubscriptionCore(
      person.id,
      { endpoint: fcm("one"), keys, userAgent: "Vitest" },
      svc,
    );
    expect(ok.status).toBe(200);

    // The same browser signed in to another account moves to that account.
    const other = await newUser();
    await registerWebPushSubscriptionCore(
      other.id,
      { endpoint: fcm("one"), keys },
      svc,
    );
    const { data } = await svc
      .from("web_push_subscription")
      .select("user_id")
      .eq("endpoint", fcm("one"))
      .single();
    expect(data?.user_id).toBe(other.id);

    const read = await other.client
      .from("web_push_subscription")
      .select("id")
      .limit(1);
    expect(read.error?.code).toBe("42501");
  });

  it("sends to every browser, drops gone subscriptions, and joins the app push", async () => {
    const person = await newUser();
    for (const s of ["a", "b"]) {
      await registerWebPushSubscriptionCore(
        person.id,
        { endpoint: fcm(s), keys },
        svc,
      );
    }
    goneEndpoints.add(fcm("b"));

    const result = await sendWebPushToUser(
      person.id,
      {
        title: "New event from @someone",
        body: "Sat 20 Sep",
        link: "/events/abc",
        data: { notificationId: "11111111-1111-4111-8111-111111111111" },
      },
      { service: svc },
    );
    expect(result).toBe("sent");
    const sent = webPushSends.find((w) => w.endpoint === fcm("a"));
    expect(JSON.parse(sent?.body ?? "{}")).toEqual({
      title: "New event from @someone",
      body: "Sat 20 Sep",
      link: "/events/abc",
      notificationId: "11111111-1111-4111-8111-111111111111",
    });
    const { data: rows } = await svc
      .from("web_push_subscription")
      .select("endpoint, last_success_at")
      .eq("user_id", person.id);
    expect((rows ?? []).map((r) => r.endpoint)).toEqual([fcm("a")]);
    expect(rows?.[0]?.last_success_at).not.toBeNull();

    // No app device, one browser: the combined sender still reports sent.
    stubExpoFetch(() => new Response("unexpected", { status: 500 }));
    try {
      expect(await sendPushToUser(person.id, { title: "Again" })).toBe("sent");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("is removed when the account is deleted", async () => {
    const person = await newUser();
    await registerWebPushSubscriptionCore(
      person.id,
      { endpoint: fcm("deleted"), keys },
      svc,
    );
    const { error } = await svc.rpc("anonymize_deleted_account", {
      p_user_id: person.id,
    });
    expect(error).toBeNull();
    const { count } = await svc
      .from("web_push_subscription")
      .select("id", { count: "exact", head: true })
      .eq("user_id", person.id);
    expect(count).toBe(0);
  });
});

describe("recommendation email", () => {
  it("cannot be switched on while the programme gate is off", async () => {
    const person = await newUser();
    await setSettings({
      recommendations_enabled: true,
      recommendations_shadow_mode: false,
      recommendations_audience: "all",
      recommendations_email_enabled: false,
    } as Partial<SettingsRow>);
    const res = await updateNotificationPreferencesCore(
      svc,
      person.id,
      { recommendationEmails: true },
      "web",
    );
    expect(res.status).toBe(403);
    // Turning it off is always allowed.
    const off = await updateNotificationPreferencesCore(svc, person.id, {
      recommendationEmails: false,
    });
    expect(off.status).toBe(200);
    expect(off.data?.recommendationEmails).toBe(false);
  });

  it("queues the digest by email only for people who opted in, sends the live picks, and honours every way out", async () => {
    const organizer = await newOrganizer();
    await svc
      .from("user_info")
      .update({ username: `${TOKEN}_org` })
      .eq("id", organizer.id);
    const emailFan = await newUser();
    const pushFan = await newUser();
    const laterQuitter = await newUser();

    await setSettings({
      recommendations_enabled: true,
      recommendations_shadow_mode: false,
      recommendations_audience: "all",
      recommendations_email_enabled: true,
      daily_push_cap: 1,
      weekly_push_cap: 3,
    } as Partial<SettingsRow>);

    for (const u of [emailFan, pushFan, laterQuitter]) {
      const sub = await subscribeCore(
        svc,
        u.id,
        { kind: "organizer", organizerId: organizer.id },
        "profile",
      );
      expect(sub.status).toBe(200);
    }
    for (const u of [emailFan, laterQuitter]) {
      const on = await updateNotificationPreferencesCore(
        svc,
        u.id,
        { recommendationEmails: true },
        "app",
      );
      expect(on.status).toBe(200);
      expect(on.data?.recommendationEmails).toBe(true);
    }
    const { data: granted } = await svc
      .from("notification_consent_event")
      .select("action, source, channel, topic")
      .eq("user_id", emailFan.id);
    expect(granted).toEqual([
      {
        action: "granted",
        source: "settings_app",
        channel: "email",
        topic: "recommendations",
      },
    ]);

    const eventId = await makeEvent(organizer.id, `${TOKEN} Email Premiere`);
    await setSettings({
      generate_watermark: new Date(Date.now() - 11 * 60_000).toISOString(),
    } as Partial<SettingsRow>);
    expect(
      (await svc.rpc("recommendations_generate", { p_limit: 1000 })).error,
    ).toBeNull();
    const built = await svc.rpc("recommendations_build_digest", {
      p_limit: 50000,
      p_force: true,
    });
    expect(built.error).toBeNull();

    const noticeFor = async (userId: string) => {
      const { data } = await svc
        .from("notification")
        .select("id, title")
        .eq("type", "recommendation_digest")
        .eq("user_id", userId)
        .single();
      return data as { id: string; title: string };
    };
    const channels = async (notificationId: string) => {
      const { data } = await svc
        .from("notification_delivery")
        .select("channel, status, detail")
        .eq("notification_id", notificationId);
      return data ?? [];
    };

    const emailNotice = await noticeFor(emailFan.id);
    const pushNotice = await noticeFor(pushFan.id);
    const quitterNotice = await noticeFor(laterQuitter.id);
    expect(
      (await channels(emailNotice.id)).map((d) => d.channel).sort(),
    ).toEqual(["email", "push"]);
    expect((await channels(pushNotice.id)).map((d) => d.channel)).toEqual([
      "push",
    ]);

    // The quitter uses the email's own unsubscribe link before it goes out.
    const bogus = await setRecommendationEmailsByTokenCore({
      userId: laterQuitter.id,
      token: "not-a-real-token",
      source: "email_link",
    });
    expect(bogus.status).toBe(400);
    const quit = await setRecommendationEmailsByTokenCore({
      userId: laterQuitter.id,
      token: recommendationEmailUnsubscribeToken(laterQuitter.id),
      source: "email_one_click",
    });
    expect(quit.status).toBe(200);

    const sentEmails: RecommendationEmail[] = [];
    const run = await deliverQueuedNotificationsCore({
      sendEmail: async () => ({ ok: true }),
      sendRecommendationEmail: async (email) => {
        sentEmails.push(email);
        return { ok: true };
      },
      sendPush: async () => "no_devices",
    });
    expect(run.status).toBe(200);

    const mine = sentEmails.filter((e) =>
      [emailFan.id, laterQuitter.id].includes(e.userId),
    );
    expect(mine.map((e) => e.userId)).toEqual([emailFan.id]);
    expect(mine[0].to).toBe(emailFan.email);
    expect(mine[0].notificationId).toBe(emailNotice.id);
    expect(mine[0].headline).toBe(emailNotice.title);
    expect(mine[0].items).toHaveLength(1);
    expect(mine[0].items[0]).toMatchObject({
      subjectType: "event",
      title: `${TOKEN} Email Premiere`,
      reason: "organizer",
      organizerUsername: `${TOKEN}_org`,
    });
    expect(mine[0].items[0].path).toMatch(/^\/events\/[a-z0-9]+$/);

    const quitterEmail = (await channels(quitterNotice.id)).find(
      (d) => d.channel === "email",
    );
    expect(quitterEmail?.status).toBe("skipped");
    expect(quitterEmail?.detail).toBe("opted_out");
    const { data: withdrawn } = await svc
      .from("notification_consent_event")
      .select("action, source")
      .eq("user_id", laterQuitter.id)
      .order("created_at", { ascending: true });
    expect(withdrawn?.map((w) => w.action)).toEqual(["granted", "withdrawn"]);
    expect(withdrawn?.[1]?.source).toBe("email_one_click");

    // Email arrived, push had no device: the picks count as delivered.
    const { data: rec } = await svc
      .from("recommendation")
      .select("status")
      .eq("user_id", emailFan.id)
      .eq("subject_id", eventId)
      .single();
    expect(rec?.status).toBe("notified");
    const { data: digest } = await svc
      .from("recommendation_digest")
      .select("delivery_status")
      .eq("notification_id", emailNotice.id)
      .single();
    expect(digest?.delivery_status).toBe("sent");

    // The event is cancelled after the build: nothing is left to email.
    const items = await svc.rpc("recommendation_digest_email_items", {
      p_notification_id: emailNotice.id,
    });
    expect(items.data).toHaveLength(1);
    await svc.from("event").update({ status: "canceled" }).eq("id", eventId);
    const after = await svc.rpc("recommendation_digest_email_items", {
      p_notification_id: emailNotice.id,
    });
    expect(after.data).toHaveLength(0);

    // Nobody but the service reads the consent record or the email items.
    const read = await emailFan.client
      .from("notification_consent_event")
      .select("id")
      .limit(1);
    expect(read.error?.code).toBe("42501");
    const rpc = await emailFan.client.rpc("recommendation_digest_email_items", {
      p_notification_id: emailNotice.id,
    });
    expect(rpc.error).not.toBeNull();
  });

  it("skips queued email as channel_off when the programme gate closes", async () => {
    const organizer = await newOrganizer();
    const fan = await newUser();
    await setSettings({
      recommendations_enabled: true,
      recommendations_shadow_mode: false,
      recommendations_audience: "all",
      recommendations_email_enabled: true,
    } as Partial<SettingsRow>);
    await subscribeCore(
      svc,
      fan.id,
      { kind: "organizer", organizerId: organizer.id },
      "profile",
    );
    await updateNotificationPreferencesCore(svc, fan.id, {
      recommendationEmails: true,
    });
    await makeEvent(organizer.id, `${TOKEN} Gate Premiere`);
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
      .eq("user_id", fan.id)
      .single();

    await setSettings({
      recommendations_email_enabled: false,
    } as Partial<SettingsRow>);
    const sent: RecommendationEmail[] = [];
    await deliverQueuedNotificationsCore({
      sendEmail: async () => ({ ok: true }),
      sendRecommendationEmail: async (email) => {
        sent.push(email);
        return { ok: true };
      },
      sendPush: async () => "sent",
    });
    expect(sent.some((e) => e.userId === fan.id)).toBe(false);
    const { data: email } = await svc
      .from("notification_delivery")
      .select("status, detail")
      .eq("notification_id", notice?.id as string)
      .eq("channel", "email")
      .single();
    expect(email?.status).toBe("skipped");
    expect(email?.detail).toBe("channel_off");
  });
});
