import type { Database } from "@abonten/types/database.types";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// get_organizer_needs_attention used to answer with an English sentence
// and nothing else, so the organizer dashboard said "Starts Oct 06 with no
// sales yet." to a French reader, with the day worked out in the
// database's time zone. It now also returns the facts (migration
// 20261001200000) and the apps word them (@abonten/core
// organizerNeedsAttention). This holds the shape both apps read, the
// English sentence older app versions still print, and who may call it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postEventCore } from "../events/postEventCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("the organizer dashboard's needs-attention list", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let eventId: string;

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  beforeAll(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    const start = new Date(Date.now() + 3 * 86_400_000);
    const posted = await postEventCore(service, organizer.id, {
      title: "Needs attention gate",
      description: "Created by the needs-attention suite.",
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
    });
    if (posted.status !== 200) throw new Error(posted.message);
    eventId = posted.eventId;
  });

  afterAll(async () => {
    await service.from("event").delete().eq("organizer_id", organizer.id);
    await deleteTestUser(service, organizer.id);
  });

  it("returns the facts behind the sentence, for the apps to word", async () => {
    const { data, error } = await organizer.client.rpc(
      "get_organizer_needs_attention",
      { p_days_soon: 7 },
    );
    expect(error).toBeNull();
    const row = (data ?? []).find((r) => r.event_id === eventId);
    expect(row).toBeDefined();
    expect(row?.rule_type).toBe("no_sales_yet");
    expect(row?.sold).toBe(0);
    expect(row?.timezone).toBe("Africa/Accra");
    expect(Number.isNaN(Date.parse(row?.starts_at ?? ""))).toBe(false);
    // Nothing is left of a tier's stock to report for this rule.
    expect(row?.remaining).toBeNull();
    expect(row?.ticket_type).toBeNull();
  });

  it("still sends the English sentence installed app versions print", async () => {
    const { data } = await organizer.client.rpc(
      "get_organizer_needs_attention",
      { p_days_soon: 7 },
    );
    const row = (data ?? []).find((r) => r.event_id === eventId);
    expect(row?.message).toMatch(
      /^Starts [A-Z][a-z]{2} \d{2} with no sales yet\.$/,
    );
  });

  it("reaches the dashboard document with the same facts", async () => {
    const { data, error } = await organizer.client.rpc(
      "get_organizer_dashboard",
      {
        p_start: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        p_end: new Date().toISOString(),
        p_prev_start: null,
        p_prev_end: null,
        p_bucket: "day",
        p_timezone: "Africa/Accra",
      } as never,
    );
    expect(error).toBeNull();
    const attention = (data as { attention: { event_id: string }[] }).attention;
    const row = attention.find((r) => r.event_id === eventId) as
      | Record<string, unknown>
      | undefined;
    expect(row).toBeDefined();
    expect(row).toHaveProperty("starts_at");
    expect(row).toHaveProperty("timezone", "Africa/Accra");
    expect(row).toHaveProperty("sold", 0);
  });

  it("says nothing to someone who is not signed in", async () => {
    const anon = createClient<Database>(
      process.env.SUPABASE_TEST_URL as string,
      process.env.SUPABASE_TEST_ANON_KEY as string,
      { auth: { persistSession: false } },
    );
    const { data, error } = await anon.rpc("get_organizer_needs_attention", {
      p_days_soon: 7,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});
