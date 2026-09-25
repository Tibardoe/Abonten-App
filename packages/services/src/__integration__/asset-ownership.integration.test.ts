import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Production gate (2026-09-25), upload audit. A listing stores its image as
// a Cloudinary public_id the client sends, and when that image is replaced
// or the draft deleted the server destroys the previous asset. Nothing tied
// the id to the account sending it: an organizer could put another
// organizer's flyer id on their own event, replace it, and the server would
// delete the other organizer's image from Cloudinary. Cloudinary is faked
// here; every destroy call is recorded.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  deleteEventDraftCore,
  saveEventDraftCore,
} from "../events/eventDraftCore";
import { postEventCore } from "../events/postEventCore";
import { updateEventCore } from "../events/updateEventCore";
import { cloudinary } from "../media/cloudinaryClient";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const start = new Date(Date.now() + 3 * 86_400_000);
const base = {
  description: "Created by the asset-ownership suite.",
  category: "Business & Networking",
  types: ["Conferences"],
  address: "Independence Avenue, Accra",
  addressDetails: { country_code: "GH", city: "Accra" },
  latitude: 5.5566,
  longitude: -0.1969,
  capacity: 50,
  requireRegistration: false,
  startsAt: start.toISOString(),
  endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
  freeEvent: true,
};

describe("a listing's image can only be destroyed when no one else uses it", () => {
  let service: SupabaseClient<Database>;
  let victim: TestUser;
  let attacker: TestUser;
  const victimFlyer = `event_flyers/victim-${crypto.randomUUID()}`;
  const destroyed: string[] = [];

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  beforeAll(async () => {
    service = getServiceClient();
    [victim, attacker] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    vi.spyOn(cloudinary.uploader, "destroy").mockImplementation((async (
      id: string,
    ) => {
      destroyed.push(id);
      return { result: "ok" };
    }) as never);
    const created = await postEventCore(victim.client, victim.id, {
      ...base,
      title: "Victim event",
      flyerPublicId: victimFlyer,
      flyerVersion: "1",
      clientRequestId: crypto.randomUUID(),
    });
    if (created.status !== 200) throw new Error(created.message);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const u of [victim, attacker]) {
      await service.from("event").delete().eq("organizer_id", u.id);
      await service.from("drafts").delete().eq("user_id", u.id);
      await deleteTestUser(service, u.id);
    }
  });

  it("replacing a flyer that another event uses does not destroy it", async () => {
    const mine = await postEventCore(attacker.client, attacker.id, {
      ...base,
      title: "Borrowed flyer",
      flyerPublicId: victimFlyer,
      flyerVersion: "1",
      clientRequestId: crypto.randomUUID(),
    });
    if (mine.status !== 200) throw new Error(mine.message);
    destroyed.length = 0;
    const edit = await updateEventCore(attacker.client, attacker.id, {
      eventId: mine.eventId,
      title: "Borrowed flyer",
      description: base.description,
      address: base.address,
      addressDetails: base.addressDetails,
      latitude: base.latitude,
      longitude: base.longitude,
      capacity: 50,
      category: base.category,
      types: base.types,
      checked: false,
      starts_at: base.startsAt,
      ends_at: base.endsAt,
      flyerPublicId: `event_flyers/${attacker.id}/new-${crypto.randomUUID()}`,
      flyerVersion: "2",
    });
    expect(edit.status, edit.message).toBe(200);
    expect(destroyed).not.toContain(victimFlyer);
  });

  it("deleting a draft that points at another event's flyer does not destroy it", async () => {
    const draft = await saveEventDraftCore(attacker.client, attacker.id, {
      payload: { title: "Borrowed draft" },
      flyerPublicId: victimFlyer,
      flyerVersion: "1",
    });
    if (draft.status !== 200) throw new Error(draft.message);
    destroyed.length = 0;
    const del = await deleteEventDraftCore(
      attacker.client,
      attacker.id,
      draft.data.draftId,
    );
    expect(del.status, del.message).toBe(200);
    expect(destroyed).not.toContain(victimFlyer);
  });

  it("an organizer's own replaced flyer is still cleaned up", async () => {
    const own = `event_flyers/${attacker.id}/own-${crypto.randomUUID()}`;
    const mine = await postEventCore(attacker.client, attacker.id, {
      ...base,
      title: "Own flyer",
      flyerPublicId: own,
      flyerVersion: "1",
      clientRequestId: crypto.randomUUID(),
    });
    if (mine.status !== 200) throw new Error(mine.message);
    destroyed.length = 0;
    await updateEventCore(attacker.client, attacker.id, {
      eventId: mine.eventId,
      title: "Own flyer",
      description: base.description,
      address: base.address,
      addressDetails: base.addressDetails,
      latitude: base.latitude,
      longitude: base.longitude,
      capacity: 50,
      category: base.category,
      types: base.types,
      checked: false,
      starts_at: base.startsAt,
      ends_at: base.endsAt,
      flyerPublicId: `event_flyers/${attacker.id}/next-${crypto.randomUUID()}`,
      flyerVersion: "2",
    });
    expect(destroyed).toContain(own);
  });
});
