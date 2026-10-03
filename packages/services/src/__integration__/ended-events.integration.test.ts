import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// What happens to an event once its last date is over
// (archive_or_delete_expired_event, migration 20261002170000).
//
// Before that migration the nightly job deleted every ended event the
// ledger did not protect. A free ticket has no ledger row, so a free event
// took its tickets, its attendance and its reviews with it the night it
// ended. Now anything a person did with an event keeps it (archived, out of
// discovery, still reachable by its link), and only an event nobody touched
// is deleted, with its flyer queued for a clean-up that checks who else
// uses the image.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

type Outcome = {
  event_id: string;
  hard_deleted: boolean;
  archived: boolean;
  skipped?: string;
  reason?: string;
};

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

async function retire(eventId: string): Promise<Outcome> {
  const { data, error } = await service.rpc("archive_or_delete_expired_event", {
    p_event_id: eventId,
  });
  if (error) throw new Error(error.message);
  return data as unknown as Outcome;
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
  it("keeps a free event that someone registered for, with their ticket and review", async () => {
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

    const outcome = await retire(eventId);

    expect(outcome).toMatchObject({ hard_deleted: false, archived: true });
    expect(outcome.reason).toBe("attendance");
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

    // Archived takes it out of discovery, not out of reach: the person who
    // went can still open it by its link.
    const seen = await guest.client
      .from("event")
      .select("id")
      .eq("id", eventId)
      .maybeSingle();
    expect(seen.data?.id).toBe(eventId);
  });

  it("keeps an event that only has a review left", async () => {
    const eventId = await createEvent({ free: true });
    await endIt(eventId);
    const review = await service.from("event_review").insert({
      event_id: eventId,
      reviewer_id: guest.id,
      rating: 4,
      status: "approved",
    });
    expect(review.error).toBeNull();

    const outcome = await retire(eventId);

    expect(outcome).toMatchObject({ archived: true, reason: "reviews" });
    expect(await eventRow(eventId)).not.toBeNull();
  });

  it("deletes an event nobody ever registered for and queues its flyer for clean-up", async () => {
    const eventId = await createEvent({});
    const flyer = (await eventRow(eventId))?.flyer_public_id as string;
    await endIt(eventId);

    const outcome = await retire(eventId);

    expect(outcome).toMatchObject({ hard_deleted: true, archived: false });
    expect(await eventRow(eventId)).toBeNull();
    // Queued, not destroyed on the spot: the drain checks who else uses it.
    const queued = await service
      .from("draft_asset_cleanup_queue")
      .select("status, resource_type")
      .eq("public_id", flyer);
    expect(queued.data).toEqual([{ status: "queued", resource_type: "image" }]);
  });

  it("does nothing to an event that has not ended, whoever asks", async () => {
    const eventId = await createEvent({});

    const outcome = await retire(eventId);

    expect(outcome).toMatchObject({
      hard_deleted: false,
      archived: false,
      skipped: "not_ended",
    });
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
    expect(await retire(running)).toMatchObject({ skipped: "not_ended" });
    expect(await eventRow(running)).not.toBeNull();

    const over = await createEvent({ dates: [past(60), past(30)] });
    expect(await retire(over)).toMatchObject({ hard_deleted: true });
    expect(await eventRow(over)).toBeNull();
  });

  it("answers for an event that is not there or already archived", async () => {
    expect(await retire(crypto.randomUUID())).toMatchObject({
      hard_deleted: false,
      archived: false,
      skipped: "missing",
    });

    const eventId = await createEvent({ free: true });
    await register(eventId, guest.id);
    await endIt(eventId);
    await retire(eventId);
    expect(await retire(eventId)).toMatchObject({
      hard_deleted: false,
      archived: true,
      skipped: "already_archived",
    });
  });

  it("cannot be called by a signed-in person", async () => {
    const eventId = await createEvent({});
    await endIt(eventId);

    const attempt = await guest.client.rpc("archive_or_delete_expired_event", {
      p_event_id: eventId,
    });

    expect(attempt.error).not.toBeNull();
    expect(await eventRow(eventId)).not.toBeNull();
  });
});
