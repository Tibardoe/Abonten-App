import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// What happens to an event once its last date is over
// (retire_ended_events, migration 20261004100000; decisions S8 and D8).
//
// Until 2026-10-02 the nightly job deleted every ended event the ledger did
// not protect, so a free event took its tickets, attendance and reviews with
// it the night it ended. From 2026-10-02 to 2026-10-04 an event nobody
// touched was still deleted. Now every ended event is archived: out of
// discovery, still on its page, its tickets, its reviews and the organizer's
// profile. Nothing is deleted.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const HOUR = 3_600_000;
const tag = `ended-${crypto.randomUUID().slice(0, 8)}`;

let service: SupabaseClient<Database>;
let organizer: TestUser;
let guest: TestUser;
const created: string[] = [];

async function createEvent(options: {
  free?: boolean;
  dates?: { start: string; end: string }[];
}): Promise<string> {
  const { data, error } = await service.rpc("create_event", {
    p_client_request_id: crypto.randomUUID(),
    p_organizer_id: organizer.id,
    p_title: "Ended Events Test",
    p_slug: `ended-events-test-${crypto.randomUUID()}`,
    p_description: "Created by the integration test suite.",
    p_event_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
    p_event_category: "Music & Concerts",
    p_event_type: ["Live Concerts"],
    p_latitude: 5.6037,
    p_longitude: -0.187,
    p_address: { full_address: "Accra, Ghana" },
    p_capacity: 100,
    p_website_url: null,
    p_flyer_public_id: `test/${tag}-${crypto.randomUUID().slice(0, 8)}`,
    p_flyer_version: "1",
    p_starts_at: options.dates
      ? null
      : new Date(Date.now() + 24 * HOUR).toISOString(),
    p_ends_at: options.dates
      ? null
      : new Date(Date.now() + 28 * HOUR).toISOString(),
    p_require_registration: false,
    p_featured: false,
    p_specific_dates: options.dates ?? null,
    p_ticket_types: [
      {
        type: options.free ? "FREE" : "General",
        price: options.free ? 0 : 40,
        currency: "GHS",
        quantity: 20,
        available_from: null,
        available_until: null,
      },
    ],
    p_promo_codes: null,
    p_receiving_account: null,
    p_place_id: null,
  } as unknown as Database["public"]["Functions"]["create_event"]["Args"]);
  if (error || !data) throw new Error(`create_event: ${error?.message}`);
  created.push(data);
  return data;
}

/** A free ticket through the real issuing function (ticket + attendance). */
async function register(eventId: string, userId: string): Promise<string> {
  const { data, error } = await service.rpc("issue_free_ticket", {
    p_user_id: userId,
    p_event_id: eventId,
    p_occurrence_id: null,
    p_ticket_code: `T-${crypto.randomUUID().slice(0, 12).toUpperCase()}`,
    p_qr_public_id: `test/${tag}-qr-${crypto.randomUUID().slice(0, 8)}`,
    p_qr_version: "1",
    p_expires_at: new Date(Date.now() + 30 * HOUR).toISOString(),
  } as never);
  if (error || !data) throw new Error(`issue_free_ticket: ${error?.message}`);
  return data as string;
}

/** Moves a single-date event so that it ended an hour ago. */
async function endIt(eventId: string) {
  const { error } = await service
    .from("event")
    .update({
      starts_at: new Date(Date.now() - 5 * HOUR).toISOString(),
      ends_at: new Date(Date.now() - HOUR).toISOString(),
    })
    .eq("id", eventId);
  if (error) throw new Error(error.message);
}

/** The scheduled job, run now. */
async function runJob(): Promise<{ archived: number }> {
  const { data, error } = await service.rpc("retire_ended_events");
  if (error) throw new Error(error.message);
  return data as unknown as { archived: number };
}

async function eventRow(eventId: string) {
  const { data } = await service
    .from("event")
    .select("id, archived_at, flyer_public_id")
    .eq("id", eventId)
    .maybeSingle();
  return data;
}

beforeAll(async () => {
  service = getServiceClient();
  organizer = await createTestUser(service);
  guest = await createTestUser(service);
});

afterAll(async () => {
  if (created.length > 0) {
    // Archived events hold tickets and attendance; the cascade takes them.
    await service.from("event").delete().in("id", created);
  }
  await service
    .from("draft_asset_cleanup_queue")
    .delete()
    .like("public_id", `test/${tag}%`);
  for (const u of [organizer, guest]) await deleteTestUser(service, u.id);
});

describe("an event whose last date is over", () => {
  it("is archived with its tickets, attendance and reviews, and still opens by its link", async () => {
    const eventId = await createEvent({ free: true });
    const ticketId = await register(eventId, guest.id);
    await endIt(eventId);
    // Checked in at the door, then a review once it was over.
    await service
      .from("ticket")
      .update({ status: "used", used_at: new Date().toISOString() })
      .eq("id", ticketId);
    const review = await service.from("event_review").insert({
      event_id: eventId,
      reviewer_id: guest.id,
      rating: 5,
      status: "approved",
    });
    expect(review.error).toBeNull();

    const result = await runJob();

    expect(result.archived).toBeGreaterThanOrEqual(1);
    expect((await eventRow(eventId))?.archived_at).not.toBeNull();
    const ticket = await service
      .from("ticket")
      .select("id, status")
      .eq("id", ticketId)
      .maybeSingle();
    expect(ticket.data?.status).toBe("used");
    const attendance = await service
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId);
    expect(attendance.count).toBe(1);
    const reviews = await service
      .from("event_review")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId);
    expect(reviews.count).toBe(1);

    // Archived takes it out of discovery, not out of reach.
    const seen = await guest.client
      .from("event")
      .select("id")
      .eq("id", eventId)
      .maybeSingle();
    expect(seen.data?.id).toBe(eventId);
  });

  it("is archived, not deleted, when nobody registered for it, and stays on the organizer's profile", async () => {
    const eventId = await createEvent({});
    const flyer = (await eventRow(eventId))?.flyer_public_id as string;
    await endIt(eventId);

    await runJob();

    expect((await eventRow(eventId))?.archived_at).not.toBeNull();
    // Its flyer is still the event's: nothing is queued for clean-up.
    const queued = await service
      .from("draft_asset_cleanup_queue")
      .select("id")
      .eq("public_id", flyer);
    expect(queued.data).toEqual([]);
    // Anyone reading the organizer's events still finds it.
    const profile = await guest.client
      .from("event")
      .select("id")
      .eq("organizer_id", organizer.id);
    expect((profile.data ?? []).map((e) => e.id)).toContain(eventId);
  });

  it("leaves an event that has not ended", async () => {
    const eventId = await createEvent({});

    await runJob();

    expect((await eventRow(eventId))?.archived_at).toBeNull();
  });

  it("judges an event with several dates by its last one", async () => {
    const past = (hoursAgo: number) => ({
      start: new Date(Date.now() - (hoursAgo + 2) * HOUR).toISOString(),
      end: new Date(Date.now() - hoursAgo * HOUR).toISOString(),
    });
    const future = {
      start: new Date(Date.now() + 48 * HOUR).toISOString(),
      end: new Date(Date.now() + 50 * HOUR).toISOString(),
    };
    const running = await createEvent({ dates: [past(30), future] });
    const over = await createEvent({ dates: [past(60), past(30)] });

    await runJob();

    expect((await eventRow(running))?.archived_at).toBeNull();
    expect((await eventRow(over))?.archived_at).not.toBeNull();
  });

  it("does not archive twice: a second run leaves the first date alone", async () => {
    const eventId = await createEvent({});
    await endIt(eventId);
    await runJob();
    const first = (await eventRow(eventId))?.archived_at;

    await runJob();

    expect((await eventRow(eventId))?.archived_at).toBe(first);
  });

  it("cannot be run by a signed-in person or a visitor", async () => {
    const eventId = await createEvent({});
    await endIt(eventId);

    const signedIn = await guest.client.rpc("retire_ended_events");
    expect(signedIn.error).not.toBeNull();
    expect((await eventRow(eventId))?.archived_at).toBeNull();

    // The function the old edge function called is gone.
    const old = await service.rpc(
      "archive_or_delete_expired_event" as never,
      { p_event_id: eventId } as never,
    );
    expect(old.error).not.toBeNull();
  });
});
