import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Bringing another run into this one (docs/architecture/show-runs.md §2b):
// an organizer joins a second run of the same play (or a single listing) to
// a run, so buyers see one listing; another account's listing, the same
// run, a run with a pass and two shows at the same time at one venue are
// refused, and the emptied run is deleted.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  joinEventRunsCore,
  listJoinableRunsCore,
} from "../events/eventShowsCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const DAY = 86_400_000;

describe("joining runs of shows", () => {
  let service: SupabaseClient<Database>;
  const users: TestUser[] = [];
  const eventIds: string[] = [];
  let organizer: TestUser;
  let other: TestUser;

  async function show(organizerId: string, daysAhead: number): Promise<string> {
    const { eventId } = await createTestEventWithTicketType(
      service,
      organizerId,
      { quantity: 10, price: 0 },
    );
    eventIds.push(eventId);
    const starts = new Date(Date.now() + daysAhead * DAY);
    const { error } = await service
      .from("event")
      .update({
        starts_at: starts.toISOString(),
        ends_at: new Date(starts.getTime() + 2 * 3_600_000).toISOString(),
      })
      .eq("id", eventId);
    if (error) throw new Error(error.message);
    return eventId;
  }

  async function run(organizerId: string, days: number[]) {
    const ids: string[] = [];
    for (const d of days) ids.push(await show(organizerId, d));
    const { data: series, error } = await service
      .from("event_series")
      .insert({ organizer_id: organizerId })
      .select("id")
      .single();
    if (error || !series) throw new Error(error?.message);
    await service.from("event").update({ series_id: series.id }).in("id", ids);
    return { ids, seriesId: series.id as string };
  }

  async function seriesOf(id: string): Promise<string | null> {
    const { data } = await service
      .from("event")
      .select("series_id")
      .eq("id", id)
      .single();
    return (data as { series_id: string | null }).series_id;
  }

  beforeAll(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    other = await createTestUser(service);
    users.push(organizer, other);
  });

  afterAll(async () => {
    for (const id of eventIds) {
      await deleteTestEvent(service, id).catch(() => undefined);
    }
    await service
      .from("event_series")
      .delete()
      .in(
        "organizer_id",
        users.map((u) => u.id),
      );
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("lists the other runs and joins one, whole", async () => {
    const first = await run(organizer.id, [10, 11]);
    const second = await run(organizer.id, [17, 18, 19]);
    const single = await show(organizer.id, 30);

    const list = await listJoinableRunsCore(
      organizer.client,
      organizer.id,
      first.ids[0],
    );
    expect(list.status).toBe(200);
    if (list.status !== 200) return;
    const second_ = list.data.find((r) => second.ids.includes(r.eventId));
    expect(second_?.showCount).toBe(3);
    expect(list.data.some((r) => r.eventId === single)).toBe(true);
    expect(list.data.some((r) => first.ids.includes(r.eventId))).toBe(false);

    const res = await joinEventRunsCore(organizer.id, {
      eventId: first.ids[0],
      otherEventId: second.ids[1],
    });
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.data.shows).toBe(3);
    for (const id of second.ids) {
      expect(await seriesOf(id)).toBe(first.seriesId);
    }
    const { data: gone } = await service
      .from("event_series")
      .select("id")
      .eq("id", second.seriesId);
    expect(gone ?? []).toHaveLength(0);

    // A single listing joins too; then it is the same run.
    const joined = await joinEventRunsCore(organizer.id, {
      eventId: first.ids[1],
      otherEventId: single,
    });
    expect(joined.status).toBe(200);
    expect(await seriesOf(single)).toBe(first.seriesId);
    const again = await joinEventRunsCore(organizer.id, {
      eventId: first.ids[0],
      otherEventId: single,
    });
    expect(again.status).toBe(409);
  });

  it("refuses another account's listing, a pass, and a clash", async () => {
    const mine = await run(organizer.id, [40, 41]);
    const theirs = await show(other.id, 45);
    const notMine = await joinEventRunsCore(organizer.id, {
      eventId: mine.ids[0],
      otherEventId: theirs,
    });
    expect(notMine.status).toBe(404);
    expect(await seriesOf(theirs)).toBeNull();

    const withPass = await run(organizer.id, [50, 51]);
    const { error: passError } = await service
      .from("ticket_type")
      .update({ pass_shows: 2 })
      .eq("event_id", withPass.ids[0]);
    if (passError) throw new Error(passError.message);
    const passRefused = await joinEventRunsCore(organizer.id, {
      eventId: mine.ids[0],
      otherEventId: withPass.ids[1],
    });
    expect(passRefused.status).toBe(409);
    expect(await seriesOf(withPass.ids[1])).toBe(withPass.seriesId);

    // Same start, same venue (every test event is at the same point).
    const clash = await show(organizer.id, 40);
    const { data: startOf } = await service
      .from("event")
      .select("starts_at")
      .eq("id", mine.ids[0])
      .single();
    await service
      .from("event")
      .update({ starts_at: startOf?.starts_at })
      .eq("id", clash);
    const clashRefused = await joinEventRunsCore(organizer.id, {
      eventId: mine.ids[0],
      otherEventId: clash,
    });
    expect(clashRefused.status).toBe(409);
    expect(await seriesOf(clash)).toBeNull();
  });
});
