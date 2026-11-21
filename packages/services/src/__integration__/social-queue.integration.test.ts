import type { AdminContext } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Admin › Social, the posting queue (docs/admin/social.md):
// social_queue_listings() queues newly published public, upcoming events and
// places once (three channels each), passes over what is not public, has
// started, belongs to an excluded account, is too fresh, or is a second show
// of a run, and holds the rest back when the day's cap is reached;
// social_queue_roundup() lists the events on in a week, featured first,
// once per key; the console's service computes captions, tagged links and
// images on read and records who posted. The apps reach none of it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  listSocialQueueCore,
  setSocialPostStatusCore,
} from "../admin/social/socialQueueAdminCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MIN = 60_000;

type SettingRow = Database["public"]["Tables"]["social_queue_setting"]["Row"];

/** A Monday about 400 days ahead: nothing else is on that week. */
function farMonday(): string {
  const d = new Date(Date.now() + 400 * DAY);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

describe("social posting queue", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let excluded: TestUser;
  let staff: TestUser;
  let original: SettingRow;
  const eventIds: string[] = [];
  const placeIds: string[] = [];
  const seriesIds: string[] = [];
  const roundupKeys: string[] = [];
  let ctx: AdminContext;

  async function event(
    organizerId: string,
    opts: {
      startsIn: number;
      lastsMs?: number;
      publishedAgo?: number;
      featured?: boolean;
      title?: string;
    },
  ): Promise<string> {
    const { eventId } = await createTestEventWithTicketType(
      service,
      organizerId,
      { quantity: 10, price: 80 },
    );
    eventIds.push(eventId);
    const starts = new Date(Date.now() + opts.startsIn);
    const patch: Record<string, unknown> = {
      starts_at: starts.toISOString(),
      ends_at: new Date(
        starts.getTime() + (opts.lastsMs ?? 3 * HOUR),
      ).toISOString(),
      featured: opts.featured ?? false,
      title: opts.title ?? "Social queue test event",
    };
    if (opts.publishedAgo !== undefined) {
      patch.published_at = new Date(
        Date.now() - opts.publishedAgo,
      ).toISOString();
    }
    const { error } = await service
      .from("event")
      .update(patch as never)
      .eq("id", eventId);
    if (error) throw new Error(error.message);
    return eventId;
  }

  async function place(
    ownerId: string,
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const { data, error } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: ownerId,
        name: "Social Queue Test Lounge",
        slug: `social-queue-test-${crypto.randomUUID()}`,
        description: "A social queue integration test place.",
        category_id: 1,
        location: "SRID=4326;POINT(-0.187 5.6037)",
        address: { full_address: "Oxford Street, Osu, Accra, Ghana" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
        ...extra,
      } as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message);
    const id = (data as { id: string }).id;
    placeIds.push(id);
    await service
      .from("place")
      .update({
        published_at: new Date(Date.now() - 10 * MIN).toISOString(),
      } as never)
      .eq("id", id);
    return id;
  }

  async function rowsFor(column: "event_id" | "place_id", id: string) {
    const { data, error } = await service
      .from("social_post")
      .select("channel, status, subject_kind")
      .eq(column, id);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.channel).sort();
  }

  async function runListings() {
    const { data, error } = await service.rpc("social_queue_listings", {
      p_limit: 1000,
    });
    if (error) throw new Error(error.message);
    return data as {
      queued: number;
      capped: boolean;
      usedToday: number;
      watermark: string;
    };
  }

  beforeAll(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    excluded = await createTestUser(service);
    staff = await createTestUser(service);
    const { data } = await service
      .from("social_queue_setting")
      .select("*")
      .eq("id", 1)
      .single();
    original = data as SettingRow;
    // Only what this file publishes from here on is new to the job.
    await service
      .from("social_queue_setting")
      .update({
        enabled: true,
        daily_cap: 200,
        excluded_account_ids: [excluded.id],
        queue_watermark: new Date(Date.now() - 15 * MIN).toISOString(),
      })
      .eq("id", 1);
    ctx = {
      userId: staff.id,
      email: staff.email,
      roles: ["operations"],
      permissions: ["social.view", "social.manage"],
      reauthenticatedAt: null,
    };
  });

  afterAll(async () => {
    if (eventIds.length) {
      await service.from("social_post").delete().in("event_id", eventIds);
    }
    if (placeIds.length) {
      await service.from("social_post").delete().in("place_id", placeIds);
    }
    if (roundupKeys.length) {
      await service.from("social_post").delete().in("roundup_key", roundupKeys);
    }
    for (const id of eventIds) {
      await deleteTestEvent(service, id).catch(() => undefined);
    }
    if (placeIds.length)
      await service.from("place").delete().in("id", placeIds);
    if (seriesIds.length) {
      await service.from("event_series").delete().in("id", seriesIds);
    }
    // The watermark stays where the job left it; the rest is put back.
    await service
      .from("social_queue_setting")
      .update({
        enabled: original.enabled,
        daily_cap: original.daily_cap,
        excluded_account_ids: original.excluded_account_ids,
      })
      .eq("id", 1);
    await Promise.all(
      [organizer, excluded, staff].map((u) => deleteTestUser(service, u.id)),
    );
  });

  it("queues new public listings once, on three channels, and passes over the rest", async () => {
    const upcoming = await event(organizer.id, {
      startsIn: 2 * DAY,
      publishedAgo: 10 * MIN,
    });
    const started = await event(organizer.id, {
      startsIn: -HOUR,
      publishedAgo: 10 * MIN,
    });
    const hidden = await event(organizer.id, {
      startsIn: 3 * DAY,
      publishedAgo: 10 * MIN,
    });
    await service
      .from("event")
      .update({ moderation_state: "hidden" })
      .eq("id", hidden);
    const notMine = await event(excluded.id, {
      startsIn: 3 * DAY,
      publishedAgo: 10 * MIN,
    });
    const fresh = await event(organizer.id, { startsIn: 3 * DAY });
    const showA = await event(organizer.id, {
      startsIn: 4 * DAY,
      publishedAgo: 9 * MIN,
    });
    const showB = await event(organizer.id, {
      startsIn: 5 * DAY,
      publishedAgo: 9 * MIN,
    });
    const { data: series } = await service
      .from("event_series")
      .insert({ organizer_id: organizer.id })
      .select("id")
      .single();
    seriesIds.push((series as { id: string }).id);
    await service
      .from("event")
      .update({ series_id: (series as { id: string }).id })
      .in("id", [showA, showB]);
    const open = await place(organizer.id);
    const closed = await place(organizer.id, {
      temporary_status: "temporarily_closed",
    });
    const excludedPlace = await place(excluded.id);

    const first = await runListings();
    expect(first.capped).toBe(false);

    const three = ["ig_story", "wa_channel", "x"];
    expect(await rowsFor("event_id", upcoming)).toEqual(three);
    expect(await rowsFor("place_id", open)).toEqual(three);
    for (const id of [started, hidden, notMine, fresh]) {
      expect(await rowsFor("event_id", id)).toEqual([]);
    }
    for (const id of [closed, excludedPlace]) {
      expect(await rowsFor("place_id", id)).toEqual([]);
    }
    // A run is posted once: its earliest show.
    expect(await rowsFor("event_id", showA)).toEqual(three);
    expect(await rowsFor("event_id", showB)).toEqual([]);
    // The fresh one is still ahead of the watermark for a later run.
    const { data: freshRow } = await service
      .from("event")
      .select("published_at")
      .eq("id", fresh)
      .single();
    expect(Date.parse(first.watermark)).toBeLessThan(
      Date.parse((freshRow as { published_at: string }).published_at),
    );

    // Nothing is queued twice.
    await service
      .from("social_queue_setting")
      .update({
        queue_watermark: new Date(Date.now() - 15 * MIN).toISOString(),
      })
      .eq("id", 1);
    await runListings();
    expect(await rowsFor("event_id", upcoming)).toEqual(three);
  });

  it("holds new listings back once the day's cap is reached", async () => {
    const { data: setting } = await service
      .from("social_queue_setting")
      .select("queue_watermark")
      .eq("id", 1)
      .single();
    const before = await runListings();
    await service
      .from("social_queue_setting")
      .update({ daily_cap: before.usedToday })
      .eq("id", 1);
    const waiting = await event(organizer.id, {
      startsIn: 6 * DAY,
      publishedAgo: 6 * MIN,
    });
    // Published after the watermark (the previous runs left it earlier).
    expect(
      Date.parse((setting as { queue_watermark: string }).queue_watermark),
    ).toBeLessThan(Date.now() - 6 * MIN);

    const capped = await runListings();
    expect(capped.capped).toBe(true);
    expect(await rowsFor("event_id", waiting)).toEqual([]);

    await service
      .from("social_queue_setting")
      .update({ daily_cap: 200 })
      .eq("id", 1);
    await runListings();
    expect(await rowsFor("event_id", waiting)).toEqual([
      "ig_story",
      "wa_channel",
      "x",
    ]);
  });

  it("queues a week's roundup once, featured events first", async () => {
    const monday = farMonday();
    const mondayMs = Date.parse(`${monday}T00:00:00Z`);
    const tuesday = await event(organizer.id, {
      startsIn: mondayMs + DAY + 19 * HOUR - Date.now(),
      title: "Roundup Tuesday Show",
    });
    const wednesday = await event(organizer.id, {
      startsIn: mondayMs + 2 * DAY + 19 * HOUR - Date.now(),
      featured: true,
      title: "Roundup Featured Wednesday",
    });
    await event(organizer.id, {
      startsIn: mondayMs + 9 * DAY - Date.now(),
      title: "Roundup Next Week",
    });
    await event(excluded.id, {
      startsIn: mondayMs + 3 * DAY - Date.now(),
      title: "Roundup Excluded",
    });

    const { data, error } = await service.rpc("social_queue_roundup", {
      p_kind: "week",
      p_start: monday,
    });
    expect(error).toBeNull();
    const key = `week:${monday}`;
    roundupKeys.push(key);
    expect(data).toMatchObject({ key, queued: 3, events: 2 });

    const { data: rows } = await service
      .from("social_post")
      .select("channel, event_ids")
      .eq("roundup_key", key);
    expect((rows ?? []).map((r) => r.channel).sort()).toEqual([
      "ig_feed",
      "wa_channel",
      "x",
    ]);
    expect(rows?.[0]?.event_ids).toEqual([wednesday, tuesday]);

    const again = await service.rpc("social_queue_roundup", {
      p_kind: "week",
      p_start: monday,
    });
    expect(again.data).toMatchObject({ key, skipped: "already_queued" });

    const wrongDay = await service.rpc("social_queue_roundup", {
      p_kind: "weekend",
      p_start: monday,
    });
    expect(wrongDay.error?.message).toMatch(/starts on a Friday/);
  });

  it("hands out captions, tagged links and images, and records who posted", async () => {
    const svc = service as unknown as ServiceRoleClient;
    const res = await listSocialQueueCore(svc, ctx, { status: "pending" });
    expect(res.status).toBe(200);
    if (res.status !== 200 || !res.data) return;
    const subjects = res.data.days.flatMap((d) => d.subjects);

    const listing = subjects.find(
      (s) => s.kind === "place" && s.key === `place:${placeIds[0]}`,
    );
    expect(listing?.title).toBe("Social Queue Test Lounge");
    const x = listing?.items.find((i) => i.channel === "x");
    expect(x?.link).toMatch(/^https:\/\/abontenhub\.com\/places\/.+\?src=x$/);
    expect(x?.caption).toContain("New on Abonten: Social Queue Test Lounge");
    expect(x?.caption).toContain(x?.link ?? "missing");
    expect(x?.caption).toContain("#Accra #ThingsToDoInAccra");
    expect(x?.xLength).toBeLessThanOrEqual(280);
    expect(x?.images[0]).toMatchObject({ kind: "places", format: "post" });
    const story = listing?.items.find((i) => i.channel === "ig_story");
    expect(story?.link).toMatch(/\?src=ig$/);
    expect(story?.images[0]?.format).toBe("story");
    const wa = listing?.items.find((i) => i.channel === "wa_channel");
    expect(wa?.caption).toContain(
      "Get the app: https://abontenhub.com/go/app?src=wa",
    );

    const roundup = subjects.find((s) => s.key === `roundup:${roundupKeys[0]}`);
    expect(roundup?.title).toBe("What's on in Accra this week");
    const feed = roundup?.items.find((i) => i.channel === "ig_feed");
    expect(feed?.images.map((i) => i.format)).toEqual([
      "cover",
      "post",
      "post",
    ]);
    expect(feed?.caption).toContain("1. Roundup Featured Wednesday");
    expect(feed?.link).toBe("https://abontenhub.com/explore/accra?src=ig");

    // Mark the place's X post posted, once.
    if (!x) throw new Error("expected an X item");
    const posted = await setSocialPostStatusCore(svc, ctx, {
      id: x.id,
      status: "posted",
      note: "Posted from the founder's phone",
    });
    expect(posted.status).toBe(200);
    const twice = await setSocialPostStatusCore(svc, ctx, {
      id: x.id,
      status: "posted",
    });
    expect(twice.status).toBe(409);
    const { data: row } = await service
      .from("social_post")
      .select("status, posted_by, posted_at, note")
      .eq("id", x.id)
      .single();
    expect(row).toMatchObject({
      status: "posted",
      posted_by: staff.id,
      note: "Posted from the founder's phone",
    });
    const { data: audit } = await service
      .from("admin_audit_log")
      .select("action")
      .eq("actor_id", staff.id)
      .eq("target_id", x.id);
    expect(audit?.map((a) => a.action)).toContain("social.post.posted");

    const back = await setSocialPostStatusCore(svc, ctx, {
      id: x.id,
      status: "pending",
    });
    expect(back.status).toBe(200);

    // Viewing is not working the queue.
    const viewer = { ...ctx, permissions: ["social.view" as const] };
    const refused = await setSocialPostStatusCore(svc, viewer, {
      id: x.id,
      status: "skipped",
    });
    expect(refused.status).toBe(403);
  });

  it("is out of reach of the apps", async () => {
    const read = await organizer.client.from("social_post").select("id");
    expect(read.error).not.toBeNull();
    const settings = await organizer.client
      .from("social_queue_setting")
      .select("id");
    expect(settings.error).not.toBeNull();
    const run = await organizer.client.rpc("social_queue_listings", {
      p_limit: 1,
    });
    expect(run.error).not.toBeNull();
  });
});
