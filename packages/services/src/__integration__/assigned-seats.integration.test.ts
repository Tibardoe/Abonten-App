import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Assigned seats (migration 20261119220000, docs/architecture/
// assigned-seats.md): a plan of sections and rows, an event's types mapped
// to sections, and seats given by the database when tickets are inserted.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import {
  type PostEventCoreInput,
  postEventCore,
} from "../events/postEventCore";
import {
  getEventSeatingCore,
  saveSeatingPlanCore,
  setEventSeatingCore,
} from "../seating/seatingCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

function baseInput(over: Partial<PostEventCoreInput> = {}): PostEventCoreInput {
  const start = inDays(4);
  return {
    title: "Seated Play",
    description: "Created by the assigned seats suite.",
    category: "Arts & Culture",
    types: ["Theatre"],
    address: "National Theatre, Accra",
    addressDetails: { country_code: "GH", city: "Accra" },
    latitude: 5.5566,
    longitude: -0.1969,
    capacity: null,
    requireRegistration: false,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 2 * 3_600_000).toISOString(),
    multipleTickets: [
      { type: "Stalls", price: 300, quantity: null },
      { type: "Balcony", price: 200, quantity: 4 },
    ],
    flyerPublicId: "test/flyer",
    flyerVersion: "1",
    clientRequestId: crypto.randomUUID(),
    ...over,
  };
}

describe("assigned seats", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  let other: TestUser;

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, buyer, other] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
    ]);
  });

  afterAll(async () => {
    await service.from("event").delete().eq("organizer_id", organizer.id);
    await service.from("seating_plan").delete().eq("owner_id", organizer.id);
    await Promise.all(
      [organizer, buyer, other].map((u) => deleteTestUser(service, u.id)),
    );
  });

  /** Issues the checkout's tickets the way issuance does (one insert). */
  async function issue(sessionId: string, userId: string) {
    const { data: lines } = await service
      .from("ticket_checkout")
      .select("id, ticket_type_id, quantity")
      .eq("checkout_session_id", sessionId);
    const rows = (lines ?? []).flatMap((line) =>
      Array.from({ length: line.quantity }, () => ({
        user_id: userId,
        ticket_type_id: line.ticket_type_id as string,
        ticket_checkout_id: line.id,
        status: "active",
        qr_public_id: "test/qr",
        qr_version: "1",
        expires_at: inDays(5).toISOString(),
        ticket_code: `T-${crypto.randomUUID().slice(0, 10)}`,
      })),
    );
    const { data, error } = await service
      .from("ticket")
      .insert(rows)
      .select("id, seat_number, ticket_type_id");
    expect(error).toBeNull();
    await service
      .from("ticket_checkout")
      .update({ status: "paid" })
      .eq("checkout_session_id", sessionId);
    const ids = (data ?? []).map((t) => t.id);
    const { data: seated } = await service
      .from("ticket")
      .select("id, seat_number")
      .in("id", ids);
    return seated ?? [];
  }

  it("gives an order seats side by side, best first, and frees a cancelled seat", async () => {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput(),
    );
    expect(created.status, "message" in created ? created.message : "").toBe(
      200,
    );
    if (created.status !== 200) return;
    const eventId = created.eventId;

    const saved = await saveSeatingPlanCore(organizer.id, {
      name: "National Theatre",
      sections: [
        {
          name: "Stalls",
          rows: [
            { label: "A", seats: 6 },
            { label: "B", seats: 6 },
          ],
        },
        { name: "Balcony", rows: [{ label: "C", seats: 4 }] },
      ],
    });
    expect(saved.status, "message" in saved ? saved.message : "").toBe(200);
    if (saved.status !== 200) return;
    const planId = saved.data.planId;

    const setup = await getEventSeatingCore(
      organizer.client,
      organizer.id,
      eventId,
    );
    if (setup.status !== 200) throw new Error("setup");
    const [stalls, balcony] = setup.data.plans[0].sections;
    expect(stalls.seatCount).toBe(12);
    const typeId = (name: string) =>
      setup.data.ticketTypes.find((t) => t.type === name)?.id as string;

    const set = await setEventSeatingCore(organizer.client, organizer.id, {
      eventId,
      planId,
      sections: {
        [typeId("Stalls")]: stalls.id,
        [typeId("Balcony")]: balcony.id,
      },
    });
    expect(set.status, "message" in set ? set.message : "").toBe(200);
    // A seated type sells its section: no number becomes the seat count.
    const { data: stallsType } = await service
      .from("ticket_type")
      .select("quantity, seating_section_id")
      .eq("id", typeId("Stalls"))
      .single();
    expect(stallsType).toEqual({ quantity: 12, seating_section_id: stalls.id });

    // An order of 3 Stalls: side by side in the middle of row A.
    const first = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities: { [typeId("Stalls")]: 3 },
    });
    expect(first.status, first.message).toBe(200);
    const seatsA = await issue(first.checkoutSessionId as string, buyer.id);
    expect(seatsA.map((t) => t.seat_number).sort()).toEqual([
      "Stalls · A2",
      "Stalls · A3",
      "Stalls · A4",
    ]);

    // An order of 4: row A has only 3 left together, so row B, middle.
    const second = await validateCheckoutCore(other.client, other.id, {
      eventId,
      quantities: { [typeId("Stalls")]: 4 },
    });
    expect(second.status, second.message).toBe(200);
    const seatsB = await issue(second.checkoutSessionId as string, other.id);
    expect(seatsB.map((t) => t.seat_number).sort()).toEqual([
      "Stalls · B2",
      "Stalls · B3",
      "Stalls · B4",
      "Stalls · B5",
    ]);

    // Organizer setup reads the seats given; the plan's sections lock.
    const after = await getEventSeatingCore(
      organizer.client,
      organizer.id,
      eventId,
    );
    expect(after.status === 200 && after.data.seatsGiven[stalls.id]).toBe(7);
    const locked = await saveSeatingPlanCore(organizer.id, {
      planId,
      name: "National Theatre",
      sections: [{ name: "Stalls", rows: [{ label: "A", seats: 6 }] }],
    });
    expect(locked.status).toBe(409);

    // A cancelled ticket frees its seat for the next order.
    await service
      .from("ticket")
      .update({ status: "cancelled" })
      .eq("id", seatsA[0].id);
    const { count } = await service
      .from("ticket_seat")
      .select("ticket_id", { count: "exact", head: true })
      .eq("event_id", eventId);
    expect(count).toBe(6);
  });

  it("refuses what it should", async () => {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput({ clientRequestId: crypto.randomUUID() }),
    );
    if (created.status !== 200) throw new Error("event");
    const saved = await saveSeatingPlanCore(other.id, {
      name: "Someone else's hall",
      sections: [{ name: "Hall", rows: [{ label: "A", seats: 2 }] }],
    });
    if (saved.status !== 200) throw new Error("plan");

    // Another organizer's plan.
    const foreign = await setEventSeatingCore(organizer.client, organizer.id, {
      eventId: created.eventId,
      planId: saved.data.planId,
      sections: {},
    });
    expect(foreign.status).toBe(404);

    // Bad plans.
    expect(
      (
        await saveSeatingPlanCore(organizer.id, {
          name: "Dup rows",
          sections: [
            {
              name: "Hall",
              rows: [
                { label: "A", seats: 2 },
                { label: "A", seats: 3 },
              ],
            },
          ],
        })
      ).status,
    ).toBe(400);

    // A section can't sell more places than it has seats (the database).
    const own = await saveSeatingPlanCore(organizer.id, {
      name: "Small room",
      sections: [{ name: "Room", rows: [{ label: "A", seats: 3 }] }],
    });
    if (own.status !== 200) throw new Error("own plan");
    await service
      .from("event_seating")
      .insert({ event_id: created.eventId, plan_id: own.data.planId });
    const { data: section } = await service
      .from("seating_section")
      .select("id")
      .eq("plan_id", own.data.planId)
      .single();
    const { data: type } = await service
      .from("ticket_type")
      .select("id")
      .eq("event_id", created.eventId)
      .eq("type", "Balcony")
      .single();
    const over = await service
      .from("ticket_type")
      .update({ seating_section_id: section?.id as string, quantity: 4 })
      .eq("id", type?.id as string);
    expect(over.error?.message ?? "").toMatch(/section has 3 seats/);

    // Clients read no seating table.
    const { data: visible } = await organizer.client
      .from("seating_plan")
      .select("id");
    expect(visible ?? []).toEqual([]);
  });
});
