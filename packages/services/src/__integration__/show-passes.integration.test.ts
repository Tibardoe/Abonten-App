import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Passes for several shows of a run (migration 20261120100000,
// docs/architecture/show-passes.md): sold on every show, the ticket bought
// admits to its show and chooses N - 1 others, each a ticket of its own;
// a cancelled pass takes its chosen shows with it.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addEventShowsCore } from "../events/eventShowsCore";
import {
  type PostEventCoreInput,
  postEventCore,
} from "../events/postEventCore";
import {
  addShowPassCore,
  claimShowPassCore,
  getShowPassCore,
} from "../passes/showPassCore";
import { buyerCancelGate } from "../tickets/buyerCancelGate";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

vi.mock("../tickets/saveEventQrCodeToCloudinary", () => ({
  saveEventQrCodeToCloudinary: async (_qr: string, filename: string) => ({
    public_id: `test/qr/${filename.toLowerCase()}`,
    version: 1,
  }),
}));

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

function baseInput(over: Partial<PostEventCoreInput> = {}): PostEventCoreInput {
  const start = inDays(3);
  return {
    title: `Pass Test ${crypto.randomUUID().slice(0, 6)}`,
    description: "Created by the show passes suite.",
    category: "Arts & Culture",
    types: ["Theatre"],
    address: "National Theatre, Accra",
    addressDetails: { country_code: "GH", city: "Accra" },
    latitude: 5.5566,
    longitude: -0.1969,
    capacity: 100,
    requireRegistration: false,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 2 * 3_600_000).toISOString(),
    multipleTickets: [{ type: "Regular", price: 300, quantity: 50 }],
    flyerPublicId: "test/flyer",
    flyerVersion: "1",
    clientRequestId: crypto.randomUUID(),
    ...over,
  };
}

describe("passes for several shows", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  let stranger: TestUser;

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, buyer, stranger] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
    ]);
  });

  afterAll(async () => {
    await service.from("event").delete().eq("organizer_id", organizer.id);
    await service
      .from("event_series")
      .delete()
      .eq("organizer_id", organizer.id);
    await Promise.all(
      [organizer, buyer, stranger].map((u) => deleteTestUser(service, u.id)),
    );
  });

  /** A ticket of the pass type bought on a show (the purchase path's result). */
  async function buyPass(eventId: string): Promise<string> {
    const { data: type } = await service
      .from("ticket_type")
      .select("id, quantity")
      .eq("event_id", eventId)
      .not("pass_shows", "is", null)
      .single();
    await service
      .from("ticket_type")
      .update({ quantity: (type?.quantity ?? 1) - 1 })
      .eq("id", type?.id as string);
    const { data: ticket } = await service
      .from("ticket")
      .insert({
        user_id: buyer.id,
        ticket_type_id: type?.id as string,
        status: "active",
        qr_public_id: "test/qr",
        qr_version: "1",
        expires_at: inDays(30).toISOString(),
        ticket_code: `T-${crypto.randomUUID().slice(0, 10)}`,
      })
      .select("id")
      .single();
    return ticket?.id as string;
  }

  it("sells a pass on every show, chooses shows, and cancels with the pass", async () => {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput(),
    );
    if (created.status !== 200) throw new Error("event");
    const first = created.eventId;

    // Not a run yet: no pass.
    const early = await addShowPassCore(organizer.client, organizer.id, {
      eventId: first,
      name: "Festival pass",
      shows: 3,
      price: 700,
      quantity: 10,
    });
    expect(early.status).toBe(409);

    const zoneDay = (d: number, h: number) => {
      const t = inDays(d);
      t.setUTCHours(h, 0, 0, 0);
      return t.toISOString();
    };
    const added = await addEventShowsCore(organizer.client, organizer.id, {
      eventId: first,
      shows: [4, 5, 6].map((d) => ({
        startsAt: zoneDay(d, 18),
        endsAt: zoneDay(d, 20),
      })),
      clientRequestId: crypto.randomUUID(),
    });
    expect(added.status, "message" in added ? added.message : "").toBe(200);
    if (added.status !== 200) return;
    const [second, third, fourth] = added.data.shows.map((s) => s.id);

    // A stranger can't sell one; a bad pass is refused.
    const notMine = await addShowPassCore(stranger.client, stranger.id, {
      eventId: first,
      name: "Festival pass",
      shows: 3,
      price: 700,
      quantity: 10,
    });
    expect(notMine.status).toBe(404);
    const tooMany = await addShowPassCore(organizer.client, organizer.id, {
      eventId: first,
      name: "Festival pass",
      shows: 9,
      price: 700,
      quantity: 10,
    });
    expect(tooMany.status).toBe(400);

    const pass = await addShowPassCore(organizer.client, organizer.id, {
      eventId: first,
      name: "Festival pass",
      shows: 3,
      price: 700,
      quantity: 10,
    });
    expect(pass.status, pass.message).toBe(200);
    if (pass.status !== 200) return;
    expect(pass.data).toEqual({ added: 4, skipped: 0 });

    // A show added later sells it too.
    const later = await addEventShowsCore(organizer.client, organizer.id, {
      eventId: first,
      shows: [{ startsAt: zoneDay(8, 18), endsAt: zoneDay(8, 20) }],
      clientRequestId: crypto.randomUUID(),
    });
    expect(later.status).toBe(200);
    if (later.status !== 200) return;
    const { data: copied } = await service
      .from("ticket_type")
      .select("type, pass_shows, quantity, price")
      .eq("event_id", later.data.shows[0].id)
      .not("pass_shows", "is", null)
      .single();
    expect(copied).toEqual({
      type: "Festival pass",
      pass_shows: 3,
      quantity: 10,
      price: 700,
    });

    const host = await buyPass(first);
    const state = await getShowPassCore(buyer.id, host);
    expect(state.status).toBe(200);
    if (state.status !== 200) return;
    expect(state.data.showsTotal).toBe(3);
    expect(state.data.showsUsed).toBe(1);
    expect(state.data.shows.find((s) => s.isBoughtShow)?.eventId).toBe(first);
    expect(state.data.shows).toHaveLength(5);

    // Someone else can't see or use it.
    expect((await getShowPassCore(stranger.id, host)).status).toBe(404);
    expect(
      (
        await claimShowPassCore(stranger.id, {
          ticketId: host,
          eventId: second,
        })
      ).status,
    ).toBe(404);

    const chose = await claimShowPassCore(buyer.id, {
      ticketId: host,
      eventId: second,
    });
    expect(chose.status, chose.message).toBe(200);
    if (chose.status !== 200) return;
    const { data: chosenTicket } = await service
      .from("ticket")
      .select(
        "user_id, status, transaction_id, metadata, ticket_type:ticket_type_id(event_id, quantity)",
      )
      .eq("id", chose.data.ticketId)
      .single();
    expect(chosenTicket?.user_id).toBe(buyer.id);
    expect(chosenTicket?.transaction_id).toBeNull();
    expect(chosenTicket?.ticket_type?.event_id).toBe(second);
    expect(chosenTicket?.ticket_type?.quantity).toBe(9);

    // A ticket chosen with the pass is not a pass itself: it has no shows
    // to choose (it could otherwise chain into every show of the run).
    expect((await getShowPassCore(buyer.id, chose.data.ticketId)).status).toBe(
      404,
    );
    expect(
      (
        await claimShowPassCore(buyer.id, {
          ticketId: chose.data.ticketId,
          eventId: fourth,
        })
      ).status,
    ).toBe(404);
    const chained = await service.rpc("ticket_pass_claim", {
      p_pass_ticket: chose.data.ticketId,
      p_holder: buyer.id,
      p_event_id: fourth,
      p_expires_at: inDays(9).toISOString(),
      p_ticket: {},
    });
    expect(chained.error?.message).toBe("This ticket is not a pass.");

    // The same show twice is refused; a third show fills the pass.
    expect(
      (await claimShowPassCore(buyer.id, { ticketId: host, eventId: second }))
        .status,
    ).toBe(409);
    expect(
      (await claimShowPassCore(buyer.id, { ticketId: host, eventId: third }))
        .status,
    ).toBe(200);
    expect(
      (await claimShowPassCore(buyer.id, { ticketId: host, eventId: fourth }))
        .status,
    ).toBe(409);
    const full = await getShowPassCore(buyer.id, host);
    if (full.status !== 200) throw new Error("state");
    expect(full.data.showsUsed).toBe(3);

    // Clients cannot run the pass functions themselves.
    const direct = await buyer.client.rpc("ticket_pass_claim", {
      p_pass_ticket: host,
      p_holder: buyer.id,
      p_event_id: fourth,
      p_expires_at: inDays(9).toISOString(),
      p_ticket: {},
    });
    expect(direct.error).not.toBeNull();

    // Cancelling the pass cancels the shows chosen with it and puts their
    // places back.
    await service.from("ticket").update({ status: "cancelled" }).eq("id", host);
    const { data: after } = await service
      .from("ticket_checkout")
      .select("status, event_id, ticket(status)")
      .eq("pass_ticket_id", host);
    expect(after).toHaveLength(2);
    expect(after?.every((c) => c.status === "cancelled")).toBe(true);
    expect(
      after?.every((c) =>
        (c.ticket as { status: string }[]).every(
          (t) => t.status === "cancelled",
        ),
      ),
    ).toBe(true);
    const { data: restored } = await service
      .from("ticket_type")
      .select("quantity")
      .eq("event_id", second)
      .not("pass_shows", "is", null)
      .single();
    expect(restored?.quantity).toBe(10);

    // A pass whose chosen show has started can't be cancelled by its buyer
    // (bought for a later show, so only the chosen one has started).
    const host2 = await buyPass(fourth);
    expect(
      (await claimShowPassCore(buyer.id, { ticketId: host2, eventId: second }))
        .status,
    ).toBe(200);
    expect(await buyerCancelGate([host2])).toBeNull();
    expect(
      await buyerCancelGate([host2], new Date(zoneDay(4, 19))),
    ).toMatchObject({ status: 409, reason: "started" });

    // A show Abonten has hidden is not offered and can't be chosen.
    const hiddenShow = later.data.shows[0].id;
    const host3 = await buyPass(third);
    await service
      .from("event")
      .update({ moderation_state: "hidden" })
      .eq("id", hiddenShow);
    const offered = await getShowPassCore(buyer.id, host3);
    if (offered.status !== 200) throw new Error("state");
    expect(offered.data.shows.map((s) => s.eventId)).not.toContain(hiddenShow);
    const hiddenChoice = await service.rpc("ticket_pass_claim", {
      p_pass_ticket: host3,
      p_holder: buyer.id,
      p_event_id: hiddenShow,
      p_expires_at: inDays(12).toISOString(),
      p_ticket: {},
    });
    expect(hiddenChoice.error?.message).toBe(
      "This show can no longer be chosen.",
    );
  });
});
