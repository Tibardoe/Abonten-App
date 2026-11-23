import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Same-day sales (migration 20261123090000_same_day_sales,
// docs/architecture/ticket-sales-window.md): an organizer may keep selling
// while a session is on, until N minutes before it ends
// (event.sales_close_before_end_minutes). Proven against the real database
// clock, through the paths people use: validateCheckoutCore (paid),
// registerForFreeEventCore (free), create_ticket_checkout and
// issue_free_ticket called straight, the setting written by postEventCore /
// updateEventCore and copied to new shows, and a pass choosing a show that
// is on. The default (null) still closes sales at the start.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../tickets/saveEventQrCodeToCloudinary", () => ({
  saveEventQrCodeToCloudinary: async (_qr: string, filename: string) => ({
    public_id: `test/qr/${filename.toLowerCase()}`,
    version: 1,
  }),
}));

import { registerForFreeEventCore } from "../checkout/registerForFreeEventCore";
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import { addEventShowsCore } from "../events/eventShowsCore";
import {
  type PostEventCoreInput,
  postEventCore,
} from "../events/postEventCore";
import { updateEventCore } from "../events/updateEventCore";
import {
  addShowPassCore,
  claimShowPassCore,
  getShowPassCore,
} from "../passes/showPassCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

function baseInput(over: Partial<PostEventCoreInput> = {}): PostEventCoreInput {
  const start = Date.now() + 3 * 24 * HOUR;
  return {
    title: `Same Day ${crypto.randomUUID().slice(0, 6)}`,
    description: "Created by the same-day sales suite.",
    category: "Arts & Culture",
    types: ["Theatre"],
    address: "Kokrobite, Accra",
    addressDetails: { country_code: "GH", city: "Accra" },
    latitude: 5.5566,
    longitude: -0.1969,
    capacity: 200,
    requireRegistration: false,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + 8 * HOUR).toISOString(),
    multipleTickets: [{ type: "Day entry", price: 50, quantity: 100 }],
    flyerPublicId: "test/flyer",
    flyerVersion: "1",
    clientRequestId: crypto.randomUUID(),
    ...over,
  };
}

describe("same-day sales: keep selling while it's on", () => {
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
    await service
      .from("event_series")
      .delete()
      .eq("organizer_id", organizer.id);
    await Promise.all(
      [organizer, buyer, other].map((u) => deleteTestUser(service, u.id)),
    );
  });

  async function makeEvent(
    over: Partial<PostEventCoreInput> = {},
  ): Promise<string> {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput(over),
    );
    if (created.status !== 200) throw new Error(created.message);
    return created.eventId;
  }

  /** Moves a single-date event so that it runs from `startMs` to `endMs` from now. */
  async function runFor(eventId: string, startMs: number, endMs: number) {
    const { error } = await service
      .from("event")
      .update({ starts_at: at(startMs), ends_at: at(endMs) })
      .eq("id", eventId);
    if (error) throw new Error(error.message);
  }

  async function ticketTypeOf(eventId: string): Promise<string> {
    const { data } = await service
      .from("ticket_type")
      .select("id")
      .eq("event_id", eventId)
      .order("created_at")
      .limit(1)
      .single();
    return data?.id as string;
  }

  function rpcCheckout(
    userId: string,
    eventId: string,
    ticketTypeId: string,
    occurrenceId: string | null = null,
  ) {
    return service.rpc("create_ticket_checkout", {
      p_user_id: userId,
      p_event_id: eventId,
      p_occurrence_id: occurrenceId,
      p_promo_code_id: null,
      p_promo_code_text: null,
      p_expires_at: at(15 * MINUTE),
      p_lines: [
        {
          ticket_type_id: ticketTypeId,
          quantity: 1,
          unit_price: 50,
          discount: 0,
          discounted_units: 0,
          amount: 50,
        },
      ],
    } as unknown as Database["public"]["Functions"]["create_ticket_checkout"]["Args"]);
  }

  async function dropPending(eventId: string) {
    await service
      .from("ticket_checkout")
      .update({ status: "expired" })
      .eq("event_id", eventId)
      .eq("status", "pending");
  }

  it("stores the setting on create and edit, and refuses one that isn't on the list", async () => {
    const refused = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput({ salesCloseBeforeEndMinutes: 45 }),
    );
    expect(refused.status).toBe(400);

    const eventId = await makeEvent({ salesCloseBeforeEndMinutes: 60 });
    const { data: row } = await service
      .from("event")
      .select("sales_close_before_end_minutes")
      .eq("id", eventId)
      .single();
    expect(row?.sales_close_before_end_minutes).toBe(60);

    // The database refuses a value off the list too.
    const { error: checkError } = await service
      .from("event")
      .update({ sales_close_before_end_minutes: 45 })
      .eq("id", eventId);
    expect(checkError?.code).toBe("23514");

    const { data: current } = await service
      .from("event")
      .select("starts_at, ends_at")
      .eq("id", eventId)
      .single();
    const edit = {
      eventId,
      title: "Same Day Edited",
      description: "Edited by the same-day sales suite.",
      address: "Kokrobite, Accra",
      addressDetails: { country_code: "GH", city: "Accra" },
      latitude: 5.5566,
      longitude: -0.1969,
      capacity: 200,
      category: "Arts & Culture",
      types: ["Theatre"],
      checked: false,
      starts_at: current?.starts_at as string,
      ends_at: current?.ends_at as string,
    };

    // Omitted (an older app build): kept.
    const kept = await updateEventCore(organizer.client, organizer.id, edit);
    expect(kept.status, kept.message).toBe(200);
    // Back to the default, then to "until it ends".
    for (const value of [null, 0]) {
      const result = await updateEventCore(organizer.client, organizer.id, {
        ...edit,
        salesCloseBeforeEndMinutes: value,
      });
      expect(result.status, result.message).toBe(200);
      const { data } = await service
        .from("event")
        .select("sales_close_before_end_minutes")
        .eq("id", eventId)
        .single();
      expect(data?.sales_close_before_end_minutes).toBe(value);
    }
    const bad = await updateEventCore(organizer.client, organizer.id, {
      ...edit,
      salesCloseBeforeEndMinutes: 15,
    });
    expect(bad.status).toBe(400);
  });

  it("a single date that is on: refused by default, sold until the cut-off with the setting", async () => {
    const eventId = await makeEvent();
    const ticketTypeId = await ticketTypeOf(eventId);
    // Opened three hours ago, closes in five.
    await runFor(eventId, -3 * HOUR, 5 * HOUR);

    // Default: sales closed at the start, as before.
    const closed = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities: { [ticketTypeId]: 1 },
    });
    expect(closed.status).toBe(409);
    const closedRpc = await rpcCheckout(buyer.id, eventId, ticketTypeId);
    expect(closedRpc.error?.message).toMatch(/not open for ticket sales/i);

    // Keep selling until an hour before it ends.
    await service
      .from("event")
      .update({ sales_close_before_end_minutes: 60 })
      .eq("id", eventId);
    const open = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities: { [ticketTypeId]: 1 },
    });
    expect(open.status, open.message).toBe(200);
    expect(open.checkoutSessionId).toBeTruthy();
    await dropPending(eventId);

    const openRpc = await rpcCheckout(other.id, eventId, ticketTypeId);
    expect(openRpc.error).toBeNull();
    await dropPending(eventId);

    // Past the cut-off (it ends in 45 minutes): closed again.
    await runFor(eventId, -7 * HOUR, 45 * MINUTE);
    const late = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities: { [ticketTypeId]: 1 },
    });
    expect(late.status).toBe(409);
    const lateRpc = await rpcCheckout(buyer.id, eventId, ticketTypeId);
    expect(lateRpc.error?.message).toMatch(/not open for ticket sales/i);

    // "Until it ends" still sells then.
    await service
      .from("event")
      .update({ sales_close_before_end_minutes: 0 })
      .eq("id", eventId);
    const untilEnd = await rpcCheckout(buyer.id, eventId, ticketTypeId);
    expect(untilEnd.error).toBeNull();
    await dropPending(eventId);

    // Over: nothing, whatever the setting.
    await runFor(eventId, -9 * HOUR, -MINUTE);
    const over = await rpcCheckout(buyer.id, eventId, ticketTypeId);
    expect(over.error?.message).toMatch(/not open for ticket sales/i);
  });

  it("a postponed event sells nothing, even with the setting", async () => {
    const eventId = await makeEvent({ salesCloseBeforeEndMinutes: 0 });
    const ticketTypeId = await ticketTypeOf(eventId);
    await runFor(eventId, -HOUR, 5 * HOUR);
    await service
      .from("event")
      .update({ postponed_at: new Date().toISOString() })
      .eq("id", eventId);
    const result = await rpcCheckout(buyer.id, eventId, ticketTypeId);
    expect(result.error?.message).toMatch(/postponed/i);
  });

  it("several dates: today's date is sold while it's on, the right one is checked", async () => {
    const eventId = await makeEvent({
      startsAt: null,
      endsAt: null,
      specificDates: [
        { start: at(24 * HOUR), end: at(32 * HOUR) },
        { start: at(48 * HOUR), end: at(56 * HOUR) },
      ],
      salesCloseBeforeEndMinutes: 30,
    });
    const ticketTypeId = await ticketTypeOf(eventId);
    const { data: dates } = await service
      .from("event_occurrence")
      .select("id, starts_at")
      .eq("event_id", eventId)
      .order("starts_at");
    const [today, tomorrow] = (dates ?? []).map((d) => d.id);
    // Today's opened two hours ago and runs six more; tomorrow's is ahead.
    await service
      .from("event_occurrence")
      .update({ starts_at: at(-2 * HOUR), ends_at: at(6 * HOUR) })
      .eq("id", today);

    const todays = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities: { [ticketTypeId]: 1 },
      occurrenceId: today,
    });
    expect(todays.status, todays.message).toBe(200);
    const { data: line } = await service
      .from("ticket_checkout")
      .select("occurrence_id")
      .eq("checkout_session_id", todays.checkoutSessionId as string)
      .single();
    expect(line?.occurrence_id).toBe(today);
    await dropPending(eventId);

    // Past today's cut-off: today is refused, tomorrow still sells.
    await service
      .from("event_occurrence")
      .update({ starts_at: at(-8 * HOUR), ends_at: at(20 * MINUTE) })
      .eq("id", today);
    const lateToday = await rpcCheckout(buyer.id, eventId, ticketTypeId, today);
    expect(lateToday.error?.message).toMatch(/no longer available/i);
    const lateCore = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities: { [ticketTypeId]: 1 },
      occurrenceId: today,
    });
    expect(lateCore.status).toBe(409);
    const tomorrows = await rpcCheckout(
      buyer.id,
      eventId,
      ticketTypeId,
      tomorrow,
    );
    expect(tomorrows.error).toBeNull();
    await dropPending(eventId);

    // Without the setting today's date is refused while it's on.
    await service
      .from("event_occurrence")
      .update({ starts_at: at(-2 * HOUR), ends_at: at(6 * HOUR) })
      .eq("id", today);
    await service
      .from("event")
      .update({ sales_close_before_end_minutes: null })
      .eq("id", eventId);
    const strict = await rpcCheckout(buyer.id, eventId, ticketTypeId, today);
    expect(strict.error?.message).toMatch(/no longer available/i);
  });

  it("a free registration is open while it's on with the setting, closed without", async () => {
    const eventId = await makeEvent({
      multipleTickets: null,
      freeEvent: true,
      requireRegistration: true,
    });
    await runFor(eventId, -HOUR, 6 * HOUR);

    const closed = await registerForFreeEventCore(
      buyer.client,
      buyer.id,
      eventId,
    );
    expect(closed.status).toBe(409);
    const closedRpc = await service.rpc("issue_free_ticket", {
      p_user_id: buyer.id,
      p_event_id: eventId,
      p_occurrence_id: null,
      p_ticket_code: `T-${crypto.randomUUID().slice(0, 12).toUpperCase()}`,
      p_qr_public_id: "test/qr/same-day",
      p_qr_version: "1",
      p_expires_at: at(6 * HOUR),
    } as never);
    expect(closedRpc.error?.message).toMatch(/not open for registration/i);

    await service
      .from("event")
      .update({ sales_close_before_end_minutes: 120 })
      .eq("id", eventId);
    const open = await registerForFreeEventCore(
      buyer.client,
      buyer.id,
      eventId,
    );
    expect(open.status, open.message).toBe(200);
    const { count } = await service
      .from("ticket")
      .select("id, ticket_type!inner(event_id)", { count: "exact", head: true })
      .eq("user_id", buyer.id)
      .eq("ticket_type.event_id", eventId);
    expect(count).toBe(1);

    // Two hours before the end has passed: closed.
    await runFor(eventId, -6 * HOUR, 90 * MINUTE);
    const late = await registerForFreeEventCore(
      other.client,
      other.id,
      eventId,
    );
    expect(late.status).toBe(409);
  });

  it("new shows copy the setting, and a pass may choose a show that is on", async () => {
    const first = await makeEvent({ salesCloseBeforeEndMinutes: 30 });
    const day = (d: number, h: number) => {
      const t = new Date(Date.now() + d * 24 * HOUR);
      t.setUTCHours(h, 0, 0, 0);
      return t.toISOString();
    };
    const added = await addEventShowsCore(organizer.client, organizer.id, {
      eventId: first,
      shows: [4, 5].map((d) => ({ startsAt: day(d, 11), endsAt: day(d, 19) })),
      clientRequestId: crypto.randomUUID(),
    });
    expect(added.status, "message" in added ? added.message : "").toBe(200);
    if (added.status !== 200) return;
    const [second, third] = added.data.shows.map((s) => s.id);
    const { data: copies } = await service
      .from("event")
      .select("sales_close_before_end_minutes")
      .in("id", [second, third]);
    expect(copies?.map((c) => c.sales_close_before_end_minutes)).toEqual([
      30, 30,
    ]);

    const pass = await addShowPassCore(organizer.client, organizer.id, {
      eventId: first,
      name: "Three days",
      shows: 3,
      price: 120,
      quantity: 20,
    });
    expect(pass.status, pass.message).toBe(200);

    // A pass bought on the first show.
    const { data: passType } = await service
      .from("ticket_type")
      .select("id")
      .eq("event_id", first)
      .not("pass_shows", "is", null)
      .single();
    const { data: host } = await service
      .from("ticket")
      .insert({
        user_id: buyer.id,
        ticket_type_id: passType?.id as string,
        status: "active",
        qr_public_id: "test/qr/pass",
        qr_version: "1",
        expires_at: at(30 * 24 * HOUR),
        ticket_code: `T-${crypto.randomUUID().slice(0, 10)}`,
      })
      .select("id")
      .single();
    const hostId = host?.id as string;

    // The second show is on now (opened an hour ago, closes in five).
    await runFor(second, -HOUR, 5 * HOUR);
    const state = await getShowPassCore(buyer.id, hostId);
    expect(state.status).toBe(200);
    if (state.status !== 200) return;
    expect(state.data.shows.find((s) => s.eventId === second)?.started).toBe(
      false,
    );
    const chose = await claimShowPassCore(buyer.id, {
      ticketId: hostId,
      eventId: second,
    });
    expect(chose.status, chose.message).toBe(200);

    // The third, on now but without the setting: it can't be chosen.
    await service
      .from("event")
      .update({ sales_close_before_end_minutes: null })
      .eq("id", third);
    await runFor(third, -HOUR, 5 * HOUR);
    const after = await getShowPassCore(buyer.id, hostId);
    if (after.status !== 200) throw new Error("pass state");
    expect(after.data.shows.find((s) => s.eventId === third)?.started).toBe(
      true,
    );
    const refused = await claimShowPassCore(buyer.id, {
      ticketId: hostId,
      eventId: third,
    });
    expect(refused.status).toBe(409);
  });
});
