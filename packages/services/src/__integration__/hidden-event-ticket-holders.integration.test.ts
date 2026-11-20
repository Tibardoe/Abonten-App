import type { Database } from "@abonten/types/database.types";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// A listing Abonten hides stays readable to the people holding tickets for
// it (migration 20261120140000): their tickets keep their event in My
// Tickets. Everyone else, signed in or not, still cannot read it, and a
// removed listing is hidden from its holders too.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("ticket holders and hidden listings", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let holder: TestUser;
  let stranger: TestUser;
  let eventId: string;

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, holder, stranger] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
    ]);
    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 10,
    });
    eventId = fixture.eventId;
    const { error } = await service.from("ticket").insert({
      user_id: holder.id,
      ticket_type_id: fixture.ticketTypeId,
      status: "active",
      qr_public_id: "test/qr",
      qr_version: "1",
      expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      ticket_code: `T-${crypto.randomUUID().slice(0, 10)}`,
    });
    expect(error).toBeNull();
  });

  afterAll(async () => {
    await deleteTestEvent(service, eventId);
    await Promise.all(
      [organizer, holder, stranger].map((u) => deleteTestUser(service, u.id)),
    );
  });

  /** What My Tickets reads: the ticket with its type and event. */
  async function myTickets(client: SupabaseClient<Database>) {
    const { data, error } = await client
      .from("ticket")
      .select("id, ticket_type!inner(id, event!inner(id, title))")
      .eq("ticket_type.event_id", eventId);
    expect(error).toBeNull();
    return data ?? [];
  }

  async function canRead(client: SupabaseClient<Database>) {
    const { data, error } = await client
      .from("event")
      .select("id")
      .eq("id", eventId);
    expect(error).toBeNull();
    return (data ?? []).length === 1;
  }

  it("keeps a hidden listing readable to its ticket holders only", async () => {
    const anon = createClient<Database>(
      process.env.SUPABASE_TEST_URL as string,
      process.env.SUPABASE_TEST_ANON_KEY as string,
      { auth: { persistSession: false } },
    );

    expect(await myTickets(holder.client)).toHaveLength(1);

    await service
      .from("event")
      .update({ moderation_state: "hidden" })
      .eq("id", eventId);

    // The holder still has the ticket with its event.
    expect(await myTickets(holder.client)).toHaveLength(1);
    expect(await canRead(holder.client)).toBe(true);
    // Nobody else can read it, and anonymous reads still work.
    expect(await canRead(stranger.client)).toBe(false);
    expect(await canRead(anon)).toBe(false);
    // The organizer side always could.
    expect(await canRead(organizer.client)).toBe(true);

    // A removed listing is gone for its holders too.
    await service
      .from("event")
      .update({ moderation_state: "removed" })
      .eq("id", eventId);
    expect(await canRead(holder.client)).toBe(false);
    expect(await myTickets(holder.client)).toHaveLength(0);
  });
});
