import type { AdminContext } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { SocialQueueSubject } from "@abonten/types/socialQueueType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Organizer social links (migration 20261122100000,
// docs/architecture/social-distribution.md §4): an owner saves their
// Instagram / X / TikTok / Facebook through the profile service, stored in
// canonical form; the database refuses any other shape (even written past
// the service) and anyone else's write; a deleted account loses them.
// Admin › Social then credits the lister: "via @handle" on X, a tip to
// mention them on Instagram, the venue's accounts when the organizer has
// none, never a handle that does not parse; a roundup carries its video
// frames.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listSocialQueueCore } from "../admin/social/socialQueueAdminCore";
import { updateProfileCore } from "../profile/updateProfileCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const DAY = 86_400_000;

/** A Monday about 500 days ahead, clear of every other roundup. */
function farMonday(): string {
  const d = new Date(Date.now() + 500 * DAY);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

describe("organizer social links", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let plain: TestUser;
  let other: TestUser;
  let leaving: TestUser;
  let staff: TestUser;
  let ctx: AdminContext;
  const eventIds: string[] = [];
  const placeIds: string[] = [];
  const roundupKey = `week:${farMonday()}`;

  async function links(userId: string): Promise<unknown> {
    const { data, error } = await service
      .from("user_info")
      .select("social_links")
      .eq("id", userId)
      .single();
    if (error) throw new Error(error.message);
    return data.social_links;
  }

  async function place(name: string, socialLinks: unknown): Promise<string> {
    const { data, error } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: plain.id,
        name,
        slug: `social-links-test-${crypto.randomUUID()}`,
        description: "An organizer social links integration test place.",
        category_id: 1,
        location: "SRID=4326;POINT(-0.187 5.6037)",
        address: { full_address: "Oxford Street, Osu, Accra, Ghana" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
        social_links: socialLinks,
      } as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message);
    const id = (data as { id: string }).id;
    placeIds.push(id);
    return id;
  }

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, plain, other, leaving, staff] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
    ]);
    ctx = {
      userId: staff.id,
      email: staff.email,
      roles: ["operations"],
      permissions: ["social.view"],
      reauthenticatedAt: null,
    };
  });

  afterAll(async () => {
    await service.from("social_post").delete().eq("roundup_key", roundupKey);
    if (eventIds.length) {
      await service.from("social_post").delete().in("event_id", eventIds);
    }
    if (placeIds.length) {
      await service.from("social_post").delete().in("place_id", placeIds);
    }
    for (const id of eventIds) {
      await deleteTestEvent(service, id).catch(() => undefined);
    }
    if (placeIds.length) {
      await service.from("place").delete().in("id", placeIds);
    }
    await Promise.all(
      [organizer, plain, other, leaving, staff].map((u) =>
        deleteTestUser(service, u.id),
      ),
    );
  });

  it("an owner saves their accounts through the profile service, canonical", async () => {
    const saved = await updateProfileCore(organizer.client, organizer.id, {
      social_links: {
        instagram: "@dj.kwame",
        x: "https://twitter.com/djkwame?lang=en",
        tiktok: "",
        facebook: null,
      },
    });
    expect(saved.status).toBe(200);
    expect(saved.data?.socialLinks).toEqual({
      instagram: "https://www.instagram.com/dj.kwame",
      x: "https://x.com/djkwame",
    });
    expect(await links(organizer.id)).toEqual(saved.data?.socialLinks);

    // Anything that is not a profile on that network is refused, and
    // nothing changes.
    for (const bad of [
      { instagram: "javascript:alert(1)" },
      { x: "https://evil.example/djkwame" },
      { snapchat: "@djkwame" },
      "@djkwame",
    ]) {
      const refused = await updateProfileCore(organizer.client, organizer.id, {
        social_links: bad,
      });
      expect(refused.status).toBe(400);
      expect(refused.data?.invalidSocialLinks?.length).toBeGreaterThan(0);
    }
    expect(await links(organizer.id)).toEqual(saved.data?.socialLinks);

    // Saving other fields leaves the accounts alone.
    const bio = await updateProfileCore(organizer.client, organizer.id, {
      bio: "Afrobeats nights in Osu",
    });
    expect(bio.status).toBe(200);
    expect(bio.data?.socialLinks).toEqual(saved.data?.socialLinks);
  });

  it("the database refuses other shapes and anyone else's write", async () => {
    // Written past the service (the Data API, as older app builds do).
    for (const value of [
      { instagram: "javascript:alert(1)" },
      { x: "https://x.com/djkwame/status/1" },
      { website: "https://djkwame.example" },
      ["https://x.com/djkwame"],
      "https://x.com/djkwame",
    ]) {
      const { error } = await organizer.client
        .from("user_info")
        .update({ social_links: value as never })
        .eq("id", organizer.id);
      expect(error?.code, JSON.stringify(value)).toBe("23514");
    }
    const ok = await organizer.client
      .from("user_info")
      .update({
        social_links: {
          instagram: "https://www.instagram.com/dj.kwame",
          x: "https://x.com/djkwame",
          tiktok: "https://www.tiktok.com/@djkwame",
        },
      })
      .eq("id", organizer.id);
    expect(ok.error).toBeNull();

    // Somebody else's write matches no row.
    const theirs = await other.client
      .from("user_info")
      .update({ social_links: { x: "https://x.com/someoneelse" } })
      .eq("id", organizer.id)
      .select("id");
    expect(theirs.data ?? []).toEqual([]);
    expect(await links(organizer.id)).toMatchObject({
      x: "https://x.com/djkwame",
    });

    // They are part of the public profile.
    const anon = createClient<Database>(
      process.env.SUPABASE_TEST_URL as string,
      process.env.SUPABASE_TEST_ANON_KEY as string,
      { auth: { persistSession: false } },
    );
    const { data: seen } = await anon
      .from("user_info")
      .select("social_links")
      .eq("id", organizer.id)
      .single();
    expect(seen?.social_links).toMatchObject({ x: "https://x.com/djkwame" });
  });

  it("a deleted account loses its accounts", async () => {
    await updateProfileCore(leaving.client, leaving.id, {
      social_links: { x: "@leaving_soon" },
    });
    expect(await links(leaving.id)).toEqual({
      x: "https://x.com/leaving_soon",
    });
    const { error } = await service
      .from("user_info")
      .update({ status_id: 4 })
      .eq("id", leaving.id);
    expect(error).toBeNull();
    expect(await links(leaving.id)).toBeNull();
  });

  it("Admin › Social credits the lister, never a handle that does not parse", async () => {
    const venue = await place("Osu Lounge Social Test", {
      twitter: "https://twitter.com/osu_lounge",
      instagram: "@osu.lounge",
    });
    const junk = await place("Junk Links Social Test", {
      instagram: "javascript:alert(1)",
      x: "https://evil.example/osu",
      website: "https://example.com",
    });
    const { eventId: credited } = await createTestEventWithTicketType(
      service,
      organizer.id,
      { quantity: 10, price: 80 },
    );
    eventIds.push(credited);
    const { eventId: atVenue } = await createTestEventWithTicketType(
      service,
      plain.id,
      { quantity: 10, price: 80 },
    );
    eventIds.push(atVenue);
    await service.from("event").update({ place_id: venue }).eq("id", atVenue);

    const today = new Date().toISOString().slice(0, 10);
    const rows = [
      ...(["ig_story", "x", "wa_channel"] as const).map((channel) => ({
        subject_kind: "event",
        event_id: credited,
        channel,
      })),
      { subject_kind: "event", event_id: atVenue, channel: "x" },
      { subject_kind: "place", place_id: venue, channel: "ig_story" },
      { subject_kind: "place", place_id: venue, channel: "x" },
      { subject_kind: "place", place_id: junk, channel: "ig_story" },
      { subject_kind: "place", place_id: junk, channel: "x" },
      {
        subject_kind: "roundup",
        roundup_key: roundupKey,
        event_ids: [credited, atVenue],
        channel: "ig_feed",
      },
    ].map((r) => ({
      // One bulk insert sends every column for every row.
      event_id: null,
      place_id: null,
      roundup_key: null,
      event_ids: [],
      ...r,
      queued_on: today,
    }));
    const { error: queued } = await service
      .from("social_post")
      .insert(rows as never);
    expect(queued).toBeNull();

    const res = await listSocialQueueCore(
      service as unknown as ServiceRoleClient,
      ctx,
      { status: "pending" },
    );
    expect(res.status).toBe(200);
    const subjects = (res.data?.days ?? []).flatMap((d) => d.subjects);
    const find = (key: string): SocialQueueSubject => {
      const s = subjects.find((x) => x.key === key);
      if (!s) throw new Error(`no subject ${key}`);
      return s;
    };
    const item = (s: SocialQueueSubject, channel: string) => {
      const i = s.items.find((x) => x.channel === channel);
      if (!i) throw new Error(`no ${channel} item`);
      return i;
    };

    // The organizer's own accounts.
    const own = find(`event:${credited}`);
    expect(own.lister).toMatchObject({ source: "organizer" });
    expect(own.lister?.handles.map((h) => [h.network, h.handle])).toEqual([
      ["instagram", "dj.kwame"],
      ["x", "djkwame"],
      ["tiktok", "djkwame"],
    ]);
    const ownX = item(own, "x");
    expect(ownX.caption).toContain("via @djkwame");
    expect(ownX.xLength).toBeLessThanOrEqual(280);
    // The link keeps its channel tag.
    expect(ownX.link).toMatch(/\?src=x$/);
    expect(item(own, "ig_story").listerTip).toBe(
      "Mention @dj.kwame in the Story (or send a Collab invite on a feed post), then ask them to reshare.",
    );
    expect(item(own, "wa_channel").caption).not.toContain("@djkwame");
    expect(item(own, "wa_channel").listerTip).toBeNull();
    expect(own.reel).toBeNull();

    // An organizer with none: the venue's accounts (its older "twitter" key).
    const borrowed = find(`event:${atVenue}`);
    expect(borrowed.lister).toMatchObject({
      source: "venue",
      name: "Osu Lounge Social Test",
    });
    expect(item(borrowed, "x").caption).toContain("via @osu_lounge");

    const placeSubject = find(`place:${venue}`);
    expect(placeSubject.lister?.source).toBe("place");
    expect(item(placeSubject, "x").caption).toContain("via @osu_lounge");
    expect(item(placeSubject, "ig_story").listerTip).toContain("@osu.lounge");

    // Links that do not parse credit nobody.
    const unknown = find(`place:${junk}`);
    expect(unknown.lister?.handles).toEqual([]);
    expect(item(unknown, "x").caption).not.toContain("via @");
    expect(item(unknown, "ig_story").listerTip).toBeNull();

    // A roundup credits nobody and carries its video frames.
    const roundup = find(`roundup:${roundupKey}`);
    expect(roundup.lister).toBeNull();
    expect(roundup.reel?.fileBase).toBe(
      `abonten-${roundupKey.replace(":", "-")}-reel`,
    );
    expect(roundup.reel?.frames.map((f) => [f.kind, f.format])).toEqual([
      ["roundups", "cover"],
      ["events", "story"],
      ["events", "story"],
    ]);
  });
});
