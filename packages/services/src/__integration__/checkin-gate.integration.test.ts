import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Production gate (2026-09-25): a ticket is admitted exactly once, however
// many doors scan it and however the scans interleave. Each "device" is its
// own client with its own session for the organizer; scans run truly
// concurrently against the database.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkInTicketCore } from "../tickets/checkInTicketCore";
import {
  type TestUser,
  createSessionClient,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("door check-in gate", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let guest: TestUser;
  let eventId: string;
  let ticketTypeId: string;
  const devices: SupabaseClient<Database>[] = [];

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, guest] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    ({ eventId, ticketTypeId } = await createTestEventWithTicketType(
      service,
      organizer.id,
      { quantity: 50, price: 10 },
    ));
    // Five scanner devices, each signed in separately.
    for (let i = 0; i < 5; i++)
      devices.push(await createSessionClient(organizer));
  });

  afterAll(async () => {
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await Promise.all(
      [organizer, guest, ...holders].map((u) => deleteTestUser(service, u.id)),
    );
  });

  // One holder per ticket: a user holds one active ticket without a
  // checkout per tier (ticket_one_active_free_registration).
  const holders: TestUser[] = [];
  async function issueTicket(): Promise<{ id: string; code: string }> {
    const holder = await createTestUser(service);
    holders.push(holder);
    const code = `TKT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { data, error } = await service
      .from("ticket")
      .insert({
        user_id: holder.id,
        ticket_type_id: ticketTypeId,
        status: "active",
        ticket_code: code,
        qr_public_id: "test/qr",
        qr_version: "1",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id, code };
  }

  it("100 simultaneous scans from 5 devices, by code and by id, admit once", async () => {
    const ticket = await issueTicket();
    const scans = Array.from({ length: 100 }, (_, i) =>
      checkInTicketCore(
        devices[i % devices.length],
        organizer.id,
        i % 2 === 0 ? ticket.code : ticket.id,
        true,
        eventId,
      ),
    );
    const results = await Promise.all(scans);
    const admitted = results.filter((r) => r.status === 200);
    expect(admitted).toHaveLength(1);
    expect(
      results
        .filter((r) => r.status !== 200)
        .every((r) => /already checked in/.test(r.message)),
    ).toBe(true);
    const { data } = await service
      .from("ticket")
      .select("status, used_at")
      .eq("id", ticket.id)
      .single();
    expect(data?.status).toBe("used");
    expect(data?.used_at).not.toBeNull();
  });

  it("scans in rapid waves, then a late scan after 'reconnecting', still admit once", async () => {
    const ticket = await issueTicket();
    let admitted = 0;
    for (let wave = 0; wave < 10; wave++) {
      const results = await Promise.all(
        devices.map((d) =>
          checkInTicketCore(d, organizer.id, ticket.code, true, eventId),
        ),
      );
      admitted += results.filter((r) => r.status === 200).length;
    }
    // A device that lost its connection comes back and scans again.
    const late = await checkInTicketCore(
      await createSessionClient(organizer),
      organizer.id,
      ticket.code,
      true,
      eventId,
    );
    expect(admitted).toBe(1);
    expect(late.status).toBe(400);
  });

  it("an undo racing a re-scan never leaves the ticket admitted twice", async () => {
    const ticket = await issueTicket();
    await checkInTicketCore(
      devices[0],
      organizer.id,
      ticket.code,
      true,
      eventId,
    );
    // Door A undoes a mis-tap while doors B–E re-scan.
    const results = await Promise.all([
      checkInTicketCore(devices[0], organizer.id, ticket.id, false, eventId),
      ...devices
        .slice(1)
        .map((d) =>
          checkInTicketCore(d, organizer.id, ticket.code, true, eventId),
        ),
    ]);
    const undo = results[0];
    const rescans = results.slice(1).filter((r) => r.status === 200);
    // Either the undo lost (no re-admission possible), or it won and at
    // most one door re-admitted — never two.
    expect(rescans.length).toBeLessThanOrEqual(undo.status === 200 ? 1 : 0);
  });

  it("another organizer's device cannot admit the ticket at all", async () => {
    const ticket = await issueTicket();
    const intruder = await createTestUser(service);
    try {
      const r = await checkInTicketCore(
        intruder.client,
        intruder.id,
        ticket.code,
        true,
        eventId,
      );
      expect(r.status).not.toBe(200);
      const { data } = await service
        .from("ticket")
        .select("status")
        .eq("id", ticket.id)
        .single();
      expect(data?.status).toBe("active");
    } finally {
      await deleteTestUser(service, intruder.id);
    }
  });
});
