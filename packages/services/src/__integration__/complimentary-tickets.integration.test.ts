import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Complimentary tickets (migration 20261120090000,
// docs/architecture/complimentary-tickets.md): real tickets on the
// recipient's account, counted against the stock, seated, no money moved.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { giveComplimentaryTicketsCore } from "../comps/complimentaryCore";
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

vi.mock("../tickets/saveEventQrCodeToCloudinary", () => ({
  saveEventQrCodeToCloudinary: async (_qr: string, filename: string) => ({
    public_id: `test/qr/${filename.toLowerCase()}`,
    version: 1,
  }),
}));

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

function baseInput(over: Partial<PostEventCoreInput> = {}): PostEventCoreInput {
  const start = inDays(4);
  return {
    title: "Comp Night",
    description: "Created by the complimentary tickets suite.",
    category: "Arts & Culture",
    types: ["Theatre"],
    address: "National Theatre, Accra",
    addressDetails: { country_code: "GH", city: "Accra" },
    latitude: 5.5566,
    longitude: -0.1969,
    capacity: 50,
    requireRegistration: false,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 2 * 3_600_000).toISOString(),
    multipleTickets: [{ type: "Regular", price: 300, quantity: 5 }],
    flyerPublicId: "test/flyer",
    flyerVersion: "1",
    clientRequestId: crypto.randomUUID(),
    ...over,
  };
}

describe("complimentary tickets", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let guest: TestUser;

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, guest] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    await service
      .from("user_info")
      .update({ username: `comp_${guest.id.slice(0, 8)}` })
      .eq("id", guest.id);
  });

  afterAll(async () => {
    await service.from("notification").delete().eq("user_id", guest.id);
    await service.from("event").delete().eq("organizer_id", organizer.id);
    await Promise.all(
      [organizer, guest].map((u) => deleteTestUser(service, u.id)),
    );
  });

  it("gives real tickets from the stock, with no money moved", async () => {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput(),
    );
    if (created.status !== 200) throw new Error("event");
    const { data: type } = await service
      .from("ticket_type")
      .select("id")
      .eq("event_id", created.eventId)
      .single();

    const given = await giveComplimentaryTicketsCore(
      organizer.client,
      organizer.id,
      organizer.id,
      {
        eventId: created.eventId,
        ticketTypeId: type?.id as string,
        quantity: 2,
        target: { kind: "username", username: `@comp_${guest.id.slice(0, 8)}` },
        note: "Cast family",
      },
    );
    expect(given.status, given.message).toBe(200);

    const { data: tickets } = await service
      .from("ticket")
      .select(
        "id, user_id, status, transaction_id, metadata, ticket_checkout_id",
      )
      .eq("ticket_type_id", type?.id as string);
    expect(tickets).toHaveLength(2);
    expect(tickets?.every((t) => t.user_id === guest.id)).toBe(true);
    expect(tickets?.every((t) => t.transaction_id === null)).toBe(true);

    const { data: checkout } = await service
      .from("ticket_checkout")
      .select(
        "status, unit_price, total_price, discount, complimentary_by, complimentary_note",
      )
      .eq("id", tickets?.[0].ticket_checkout_id as string)
      .single();
    expect(checkout).toEqual({
      status: "paid",
      unit_price: 0,
      total_price: 0,
      discount: 0,
      complimentary_by: organizer.id,
      complimentary_note: "Cast family",
    });

    // Out of the stock and the seats; no earning, no fee.
    const { data: left } = await service
      .from("ticket_type")
      .select("quantity")
      .eq("id", type?.id as string)
      .single();
    expect(left?.quantity).toBe(3);
    const { count: earnings } = await service
      .from("organizer_ledger_entry")
      .select("id", { count: "exact", head: true })
      .eq("event_id", created.eventId);
    expect(earnings).toBe(0);
    const { count: attending } = await service
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("event_id", created.eventId)
      .eq("status", "attending");
    expect(attending).toBe(2);

    // The guest is told.
    const { data: notice } = await service
      .from("notification")
      .select("type, title")
      .eq("user_id", guest.id)
      .eq("type", "complimentary_tickets")
      .single();
    expect(notice?.title).toBeTruthy();

    // More than the stock is refused; a stranger can't give tickets.
    const tooMany = await giveComplimentaryTicketsCore(
      organizer.client,
      organizer.id,
      organizer.id,
      {
        eventId: created.eventId,
        ticketTypeId: type?.id as string,
        quantity: 4,
        target: { kind: "username", username: `comp_${guest.id.slice(0, 8)}` },
      },
    );
    expect(tooMany.status).toBe(409);
    const stranger = await giveComplimentaryTicketsCore(
      guest.client,
      guest.id,
      guest.id,
      {
        eventId: created.eventId,
        ticketTypeId: type?.id as string,
        quantity: 1,
        target: { kind: "username", username: `comp_${guest.id.slice(0, 8)}` },
      },
    );
    expect(stranger.status).toBe(404);
    const nobody = await giveComplimentaryTicketsCore(
      organizer.client,
      organizer.id,
      organizer.id,
      {
        eventId: created.eventId,
        ticketTypeId: type?.id as string,
        quantity: 1,
        target: { kind: "username", username: "no_such_person_here" },
      },
    );
    expect(nobody.status).toBe(404);

    // Clients cannot issue them themselves.
    const direct = await organizer.client.rpc("issue_complimentary_tickets", {
      p_event_id: created.eventId,
      p_ticket_type_id: type?.id as string,
      p_recipient_id: guest.id,
      p_given_by: organizer.id,
      p_note: "",
      p_occurrence_id: null,
      p_expires_at: inDays(5).toISOString(),
      p_tickets: [],
    } as unknown as Database["public"]["Functions"]["issue_complimentary_tickets"]["Args"]);
    expect(direct.error).not.toBeNull();
  });
});
