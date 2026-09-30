import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// event.event_code is unique. Codes used to be two letters and four random
// digits, so same-prefix titles collided and the post failed with "We
// couldn't post your event". Codes are now six random characters, and a
// code that is taken anyway is drawn again. This forces the collision: the
// generator first returns a code another event already has.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  type PostEventCoreInput,
  postEventCore,
} from "../events/postEventCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const queue = vi.hoisted(() => ({ codes: [] as string[] }));

vi.mock("@abonten/core/eventCodeGenerator", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@abonten/core/eventCodeGenerator")>();
  return {
    ...real,
    generateEventCode: (title: string) =>
      queue.codes.shift() ?? real.generateEventCode(title),
  };
});

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

function input(title: string): PostEventCoreInput {
  const start = inDays(4);
  return {
    title,
    description: "Created by the event code collision suite.",
    category: "Business & Networking",
    types: ["Conferences"],
    address: "Independence Avenue, Accra",
    addressDetails: { country_code: "GH", city: "Accra" },
    latitude: 5.5566,
    longitude: -0.1969,
    capacity: 50,
    requireRegistration: false,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
    singleTicket: { price: 25, quantity: 20 },
    flyerPublicId: "test/flyer",
    flyerVersion: "1",
    clientRequestId: crypto.randomUUID(),
  };
}

describe("event codes", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  beforeAll(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
  });

  afterAll(async () => {
    await service.from("event").delete().eq("organizer_id", organizer.id);
    await deleteTestUser(service, organizer.id);
  });

  async function post(title: string): Promise<string> {
    const posted = await postEventCore(
      organizer.client,
      organizer.id,
      input(title),
    );
    if (posted.status !== 200) throw new Error(posted.message);
    return posted.eventId;
  }

  async function codeOf(id: string) {
    const { data } = await service
      .from("event")
      .select("event_code, slug")
      .eq("id", id)
      .single();
    return data;
  }

  it("gives a new event a two-letter prefix and six random characters", async () => {
    const row = await codeOf(await post("Collision Check"));
    expect(row?.event_code).toMatch(/^CC[2-9A-HJKMNP-Z]{6}$/);
  });

  it("draws a fresh code when the generated one is already taken", async () => {
    const taken = (await codeOf(await post("Clash Night")))
      ?.event_code as string;

    queue.codes.push(taken);
    const second = await post("Clash Night");
    expect(queue.codes).toHaveLength(0);
    const row = await codeOf(second);
    expect(row?.event_code).not.toBe(taken);
    expect(row?.event_code.startsWith("CN")).toBe(true);
  });

  it("gives up after three taken codes instead of looping", async () => {
    const taken = (await codeOf(await post("Loop Guard")))
      ?.event_code as string;
    queue.codes.push(taken, taken, taken);
    const refused = await postEventCore(
      organizer.client,
      organizer.id,
      input("Loop Guard"),
    );
    expect(refused.status).toBe(500);
    expect(queue.codes).toHaveLength(0);
  });
});
