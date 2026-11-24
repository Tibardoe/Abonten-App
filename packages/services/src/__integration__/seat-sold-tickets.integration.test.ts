import { localizeNotificationRow } from "@abonten/core/notifications/notices";
import { TICKET_WITH_EVENT_SELECT } from "@abonten/core/ticketSelect";
import type { Database } from "@abonten/types/database.types";
import {
  type SupabaseClient,
  createClient as createSupabaseClient,
} from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Seating after the first sale (migration 20261124090000, docs/
// architecture/assigned-seats.md): tickets sold before an event's seating
// was set get their seats when it is saved — the same chooser as at issue,
// earliest purchase first, an order side by side — and each holder is told
// once, in their language. Once a seat is given, the seating stays.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import { giveComplimentaryTicketsCore } from "../comps/complimentaryCore";
import {
  type PostEventCoreInput,
  postEventCore,
} from "../events/postEventCore";
import { notificationWordsFor } from "../notifications/createNotification";
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

// A gift's QR image is not this suite's concern.
vi.mock("../tickets/saveEventQrCodeToCloudinary", () => ({
  saveEventQrCodeToCloudinary: async (_qr: string, filename: string) => ({
    public_id: `test/qr/${filename.toLowerCase()}`,
    version: 1,
  }),
}));

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);
const PERMISSION_DENIED = "42501";
const NOT_EXPOSED = "PGRST202";

function baseInput(over: Partial<PostEventCoreInput> = {}): PostEventCoreInput {
  const start = inDays(4);
  return {
    title: "Fame In Flames",
    description: "Created by the seat sold tickets suite.",
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

type Notice = {
  id: string;
  params: Record<string, string | number | null>;
};

describe("seating after the first sale", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let first: TestUser;
  let group: TestUser;
  let late: TestUser;
  let sender: TestUser;
  let friend: TestUser;

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, first, group, late, sender, friend] = await Promise.all(
      Array.from({ length: 6 }, () => createTestUser(service)),
    );
    // The group's buyer reads Abonten in French.
    await service.from("user_info").update({ locale: "fr" }).eq("id", group.id);
    await service
      .from("user_info")
      .update({ username: `seat_${late.id.slice(0, 8)}` })
      .eq("id", late.id);
  });

  afterAll(async () => {
    const people = [organizer, first, group, late, sender, friend];
    await service
      .from("notification")
      .delete()
      .in(
        "user_id",
        people.map((u) => u.id),
      );
    await service.from("event").delete().eq("organizer_id", organizer.id);
    await service.from("seating_plan").delete().eq("owner_id", organizer.id);
    await Promise.all(people.map((u) => deleteTestUser(service, u.id)));
  });

  async function newEvent() {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput({ clientRequestId: crypto.randomUUID() }),
    );
    expect(created.status, "message" in created ? created.message : "").toBe(
      200,
    );
    if (created.status !== 200) throw new Error("event");
    const { data: types } = await service
      .from("ticket_type")
      .select("id, type")
      .eq("event_id", created.eventId);
    const typeId = (name: string) =>
      types?.find((t) => t.type === name)?.id as string;
    return { eventId: created.eventId, typeId };
  }

  async function newPlan(
    name: string,
    sections: { name: string; rows: { label: string; seats: number }[] }[],
  ) {
    const saved = await saveSeatingPlanCore(organizer.id, { name, sections });
    expect(saved.status, "message" in saved ? saved.message : "").toBe(200);
    if (saved.status !== 200) throw new Error("plan");
    const { data } = await service
      .from("seating_section")
      .select("id, name")
      .eq("plan_id", saved.data.planId);
    const sectionId = (n: string) =>
      data?.find((s) => s.name === n)?.id as string;
    return { planId: saved.data.planId, sectionId };
  }

  /** Buys and issues an order the way issuance does (one insert). */
  async function buy(
    buyer: TestUser,
    eventId: string,
    quantities: Record<string, number>,
  ) {
    const order = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities,
    });
    expect(order.status, order.message).toBe(200);
    const sessionId = order.checkoutSessionId as string;
    const { data: lines } = await service
      .from("ticket_checkout")
      .select("id, ticket_type_id, quantity")
      .eq("checkout_session_id", sessionId);
    const rows = (lines ?? []).flatMap((line) =>
      Array.from({ length: line.quantity }, () => ({
        user_id: buyer.id,
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
      .select("id, seat_number");
    expect(error).toBeNull();
    await service
      .from("ticket_checkout")
      .update({ status: "paid" })
      .eq("checkout_session_id", sessionId);
    return (data ?? []).map((t) => t.id);
  }

  async function seatsOf(ids: string[]) {
    const { data } = await service
      .from("ticket")
      .select("id, seat_number")
      .in("id", ids);
    return ids.map((id) => data?.find((t) => t.id === id)?.seat_number ?? null);
  }

  it("seats what was sold before the seating, earliest first, and tells each holder once", async () => {
    const { eventId, typeId } = await newEvent();

    // Sold before any seating: nobody has a seat.
    const [firstTicket] = await buy(first, eventId, {
      [typeId("Stalls")]: 1,
    });
    const groupTickets = await buy(group, eventId, {
      [typeId("Stalls")]: 3,
    });
    const lateTickets = await buy(late, eventId, { [typeId("Stalls")]: 2 });
    const [sentTicket] = await buy(sender, eventId, {
      [typeId("Stalls")]: 1,
    });
    expect(await seatsOf([firstTicket, ...groupTickets])).toEqual([
      null,
      null,
      null,
      null,
    ]);
    // One of the late order's tickets is cancelled: it takes no seat.
    await service
      .from("ticket")
      .update({ status: "cancelled" })
      .eq("id", lateTickets[1]);
    // A ticket sent to a friend: the friend holds it now.
    await service
      .from("ticket")
      .update({ user_id: friend.id })
      .eq("id", sentTicket);
    // A free ticket given by the organizer, after every sale.
    const gift = await giveComplimentaryTicketsCore(
      organizer.client,
      organizer.id,
      organizer.id,
      {
        eventId,
        ticketTypeId: typeId("Stalls"),
        quantity: 1,
        target: { kind: "username", username: `seat_${late.id.slice(0, 8)}` },
      },
    );
    expect(gift.status, gift.message).toBe(200);
    const { data: giftRows } = await service
      .from("ticket")
      .select("id")
      .eq("user_id", late.id)
      .eq("status", "active")
      .neq("id", lateTickets[0]);
    const giftTicket = giftRows?.[0]?.id as string;

    const { planId, sectionId } = await newPlan("Fame hall", [
      {
        name: "Stalls",
        rows: [
          { label: "A", seats: 4 },
          { label: "B", seats: 4 },
          { label: "C", seats: 4 },
        ],
      },
      { name: "Balcony", rows: [{ label: "D", seats: 4 }] },
    ]);

    // The organizer's card: open, with the tickets sold per type.
    const before = await getEventSeatingCore(
      organizer.client,
      organizer.id,
      eventId,
    );
    if (before.status !== 200) throw new Error("setup");
    expect(before.data.locked).toBe(false);
    expect(before.data.inRun).toBe(false);
    expect(
      before.data.ticketTypes.find((t) => t.id === typeId("Stalls"))?.sold,
    ).toBe(7);

    const set = await setEventSeatingCore(organizer.client, organizer.id, {
      eventId,
      planId,
      sections: {
        [typeId("Stalls")]: sectionId("Stalls"),
        [typeId("Balcony")]: sectionId("Balcony"),
      },
    });
    expect(set.status, "message" in set ? set.message : "").toBe(200);
    if (set.status !== 200) return;
    expect(set.data).toEqual({ seated: 7, holders: 4 });
    expect(set.message).toBe(
      "Seating saved. 7 tickets now have seats, and each buyer has been told.",
    );

    // The first buyer has the best seat; the order of three sits together;
    // the cancelled ticket has none; later buyers take what is left.
    expect(await seatsOf([firstTicket])).toEqual(["Stalls · A2"]);
    expect((await seatsOf(groupTickets)).sort()).toEqual([
      "Stalls · B1",
      "Stalls · B2",
      "Stalls · B3",
    ]);
    expect(await seatsOf(lateTickets)).toEqual(["Stalls · A3", null]);
    expect(await seatsOf([sentTicket])).toEqual(["Stalls · A1"]);
    expect(await seatsOf([giftTicket])).toEqual(["Stalls · A4"]);
    const { count: cancelledSeats } = await service
      .from("ticket_seat")
      .select("ticket_id", { count: "exact", head: true })
      .eq("ticket_id", lateTickets[1]);
    expect(cancelledSeats).toBe(0);

    // The holder reads the seat on their own ticket (My Tickets, the app).
    const { data: held } = await friend.client
      .from("ticket")
      .select(TICKET_WITH_EVENT_SELECT)
      .eq("id", sentTicket)
      .single();
    expect((held as { seat_number: string | null }).seat_number).toBe(
      "Stalls · A1",
    );

    // A seated type with no number sells what its section has left.
    const { data: stalls } = await service
      .from("ticket_type")
      .select("quantity, seating_section_id")
      .eq("id", typeId("Stalls"))
      .single();
    expect(stalls).toEqual({
      quantity: 5,
      seating_section_id: sectionId("Stalls"),
    });

    // One notice per holder (the friend, not the sender), pushed.
    const { data: notices } = await service
      .from("notification")
      .select("id, user_id, type, title, body, data")
      .eq("type", "ticket_seat_assigned")
      .eq("data->>eventId", eventId);
    expect(notices?.map((n) => n.user_id).sort()).toEqual(
      [first.id, group.id, late.id, friend.id].sort(),
    );
    const noticeOf = (userId: string) =>
      notices?.find((n) => n.user_id === userId);
    const groupNotice = (noticeOf(group.id)?.data as { notice: Notice }).notice;
    expect(groupNotice.id).toBe("ticket_seat_assigned");
    expect(groupNotice.params.count).toBe(3);
    expect(groupNotice.params.seats).toBe(
      "Stalls · B1, Stalls · B2, Stalls · B3",
    );
    expect(
      (noticeOf(late.id)?.data as { notice: Notice }).notice.params.seats,
    ).toBe("Stalls · A3, Stalls · A4");
    expect(noticeOf(friend.id)?.data).toMatchObject({
      kind: "ticket",
      ticketId: sentTicket,
    });

    // Worded in each holder's own language, as the push is.
    const french = await notificationWordsFor(group.id);
    const groupRow = noticeOf(group.id);
    if (!groupRow) throw new Error("notice");
    expect(
      localizeNotificationRow(
        { t: french.core, locale: french.locale },
        groupRow,
      ).title,
    ).toBe("Vos places pour Fame In Flames");
    const english = await notificationWordsFor(first.id);
    const firstRow = noticeOf(first.id);
    if (!firstRow) throw new Error("notice");
    expect(
      localizeNotificationRow(
        { t: english.core, locale: english.locale },
        firstRow,
      ).title,
    ).toBe("Your seat for Fame In Flames");

    const { data: pushes } = await service
      .from("notification_delivery")
      .select("channel, source, urgent")
      .in(
        "notification_id",
        (notices ?? []).map((n) => n.id),
      );
    expect(pushes).toHaveLength(4);
    expect(
      pushes?.every(
        (p) => p.channel === "push" && p.source === "app" && !p.urgent,
      ),
    ).toBe(true);

    // Once seats are given the old locks hold: no new seating, no new
    // sections in the plan.
    const after = await getEventSeatingCore(
      organizer.client,
      organizer.id,
      eventId,
    );
    expect(after.status === 200 && after.data.locked).toBe(true);
    expect(
      after.status === 200 && after.data.seatsGiven[sectionId("Stalls")],
    ).toBe(7);
    const again = await setEventSeatingCore(organizer.client, organizer.id, {
      eventId,
      planId,
      sections: { [typeId("Stalls")]: sectionId("Balcony") },
    });
    expect(again.status).toBe(409);
    expect("message" in again ? again.message : "").toBe(
      "Seats have been given to this event's tickets, so its seating can no longer change.",
    );
    const plan = await saveSeatingPlanCore(organizer.id, {
      planId,
      name: "Fame hall",
      sections: [{ name: "Stalls", rows: [{ label: "A", seats: 4 }] }],
    });
    expect(plan.status).toBe(409);

    // The next ticket sold is seated at issue, as before.
    const [next] = await buy(first, eventId, { [typeId("Stalls")]: 1 });
    expect(await seatsOf([next])).toEqual(["Stalls · B4"]);
    const { count: noticesAfter } = await service
      .from("notification")
      .select("id", { count: "exact", head: true })
      .eq("type", "ticket_seat_assigned")
      .eq("data->>eventId", eventId);
    expect(noticesAfter).toBe(4);
  });

  it("refuses seating the sold tickets can't fit, and changes nothing", async () => {
    const { eventId, typeId } = await newEvent();
    await buy(first, eventId, { [typeId("Stalls")]: 1 });
    // Being bought: held, so it counts too.
    const pending = await validateCheckoutCore(group.client, group.id, {
      eventId,
      quantities: { [typeId("Stalls")]: 2 },
    });
    expect(pending.status, pending.message).toBe(200);

    const { planId, sectionId } = await newPlan("Small room", [
      { name: "Small", rows: [{ label: "A", seats: 2 }] },
      { name: "Hall", rows: [{ label: "H", seats: 10 }] },
    ]);
    const tooSmall = await setEventSeatingCore(organizer.client, organizer.id, {
      eventId,
      planId,
      sections: { [typeId("Stalls")]: sectionId("Small") },
    });
    expect(tooSmall.status).toBe(409);
    expect("message" in tooSmall ? tooSmall.message : "").toBe(
      "3 tickets are already sold or held for Small, which has only 2 seats. Choose a bigger section.",
    );

    // Two types in one section: what they sell plus what is sold must fit.
    const oversold = await setEventSeatingCore(organizer.client, organizer.id, {
      eventId,
      planId,
      sections: {
        [typeId("Stalls")]: sectionId("Hall"),
        [typeId("Balcony")]: sectionId("Hall"),
      },
    });
    expect(oversold.status).toBe(400);
    expect("message" in oversold ? oversold.message : "").toBe(
      "Hall has 10 seats, but its ticket types sell 14 places. Lower their numbers of tickets, or choose another section.",
    );

    // Refused whole: no plan, no sections, no seats, no notices.
    const { data: seating } = await service
      .from("event_seating")
      .select("plan_id")
      .eq("event_id", eventId)
      .maybeSingle();
    expect(seating).toBeNull();
    const { data: types } = await service
      .from("ticket_type")
      .select("seating_section_id")
      .eq("event_id", eventId);
    expect(types?.every((t) => t.seating_section_id === null)).toBe(true);
    const { count } = await service
      .from("ticket_seat")
      .select("ticket_id", { count: "exact", head: true })
      .eq("event_id", eventId);
    expect(count).toBe(0);

    // A section that fits is fine: the held places are kept for it.
    const fits = await setEventSeatingCore(organizer.client, organizer.id, {
      eventId,
      planId,
      sections: { [typeId("Stalls")]: sectionId("Hall") },
    });
    expect(fits.status, "message" in fits ? fits.message : "").toBe(200);
    expect(fits.status === 200 && fits.data.seated).toBe(1);
    const { data: stalls } = await service
      .from("ticket_type")
      .select("quantity")
      .eq("id", typeId("Stalls"))
      .single();
    expect(stalls?.quantity).toBe(7);
  });

  it("is reachable by the service role only", async () => {
    const args = {
      p_event_id: "00000000-0000-4000-8000-0000000000ff",
      p_plan_id: null as never,
      p_sections: {},
    };
    const asService = await service.rpc("event_seating_set", args);
    expect(asService.error?.code).not.toBe(NOT_EXPOSED);
    expect(asService.error?.hint).toBe("seating_event_not_found");

    const asUser = await organizer.client.rpc("event_seating_set", args);
    expect(asUser.error?.code).toBeOneOf([PERMISSION_DENIED, NOT_EXPOSED]);

    const anon = createSupabaseClient<Database>(
      process.env.SUPABASE_TEST_URL as string,
      process.env.SUPABASE_TEST_ANON_KEY as string,
      { auth: { persistSession: false } },
    );
    const asAnon = await anon.rpc("event_seating_set", args);
    expect(asAnon.error?.code).toBeOneOf([PERMISSION_DENIED, NOT_EXPOSED]);

    // The chooser is internal: no API role reaches it.
    for (const client of [service, organizer.client]) {
      const { error } = await client.rpc(
        "_ticket_seat_give" as never,
        {
          p_ticket_id: "00000000-0000-4000-8000-0000000000ff",
        } as never,
      );
      expect(error?.code).toBeOneOf([PERMISSION_DENIED, NOT_EXPOSED]);
    }
  });
});
