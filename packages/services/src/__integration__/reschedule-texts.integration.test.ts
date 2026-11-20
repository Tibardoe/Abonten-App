import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Text messages when an event moves or is postponed (migration
// 20261120220000, docs/architecture/event-reschedule.md): queued for people
// with a verified phone, sent once each in their language, only to numbers
// in a market whose text rail is Hubtel; the kill switch stops them.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { rescheduleEventCore } from "../events/eventRescheduleCore";
import {
  type PostEventCoreInput,
  postEventCore,
} from "../events/postEventCore";
import { dispatchRescheduleTextsCore } from "../events/rescheduleTextsCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const sms = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../sms/hubtelSms", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sendHubtelSms: sms.send,
}));

const HOUR = 3_600_000;
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);
const digits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

function baseInput(): PostEventCoreInput {
  const start = inDays(4);
  return {
    title: `Texted Night ${crypto.randomUUID().slice(0, 6)}`,
    description: "Created by the reschedule texts suite.",
    category: "Arts & Culture",
    types: ["Theatre"],
    address: "National Theatre, Accra",
    addressDetails: { country_code: "GH", city: "Accra" },
    latitude: 5.5566,
    longitude: -0.1969,
    capacity: 50,
    requireRegistration: false,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 3 * HOUR).toISOString(),
    multipleTickets: [{ type: "Regular", price: 100, quantity: 20 }],
    flyerPublicId: "test/flyer",
    flyerVersion: "1",
    clientRequestId: crypto.randomUUID(),
  };
}

describe("texts when an event moves", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let ghana: TestUser;
  let abroad: TestUser;
  let noPhone: TestUser;
  const ghanaPhone = `+23324${digits(7)}`;

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, ghana, abroad, noPhone] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
    ]);
    await service.auth.admin.updateUserById(ghana.id, {
      phone: ghanaPhone.slice(1),
      phone_confirm: true,
    });
    await service.auth.admin.updateUserById(abroad.id, {
      phone: `447700${digits(6)}`,
      phone_confirm: true,
    });
    await service.from("user_info").update({ locale: "fr" }).eq("id", ghana.id);
  });

  afterAll(async () => {
    process.env.RESCHEDULE_TEXTS_KILL_SWITCH = "";
    await service.from("event").delete().eq("organizer_id", organizer.id);
    await Promise.all(
      [organizer, ghana, abroad, noPhone].map((u) =>
        deleteTestUser(service, u.id),
      ),
    );
  });

  async function eventWithHolders() {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput(),
    );
    if (created.status !== 200) throw new Error(created.message);
    const { data: type } = await service
      .from("ticket_type")
      .select("id")
      .eq("event_id", created.eventId)
      .single();
    for (const u of [ghana, abroad, noPhone]) {
      await service.from("ticket").insert({
        user_id: u.id,
        ticket_type_id: type?.id as string,
        status: "active",
        qr_public_id: "test/qr",
        qr_version: "1",
        expires_at: inDays(5).toISOString(),
        ticket_code: `T-${crypto.randomUUID().slice(0, 10)}`,
      });
    }
    return created.eventId;
  }

  it("texts each holder with a verified Ghana number once, in their language", async () => {
    sms.send.mockReset();
    sms.send.mockResolvedValue({ ok: true, messageId: "hubtel-1" });
    const eventId = await eventWithHolders();
    const moved = await rescheduleEventCore(
      organizer.client,
      organizer.id,
      organizer.id,
      {
        eventId,
        startsAt: inDays(10).toISOString(),
        endsAt: new Date(inDays(10).getTime() + 2 * HOUR).toISOString(),
        message: "New date.",
      },
    );
    expect(moved.status, moved.message).toBe(200);
    if (moved.status !== 200) return;

    // Queued for the two verified phones, not the person without one.
    const { data: queued } = await service
      .from("event_reschedule_text")
      .select("user_id, status")
      .eq("reschedule_id", moved.data.rescheduleId);
    expect(new Set((queued ?? []).map((r) => r.user_id))).toEqual(
      new Set([ghana.id, abroad.id]),
    );

    const first = await dispatchRescheduleTextsCore({ budgetMs: 10_000 });
    expect(first).toMatchObject({ sent: 1, skipped: 1, failed: 0 });
    expect(sms.send).toHaveBeenCalledTimes(1);
    const call = sms.send.mock.calls[0][0] as {
      toE164: string;
      content: string;
    };
    expect(call.toE164).toBe(ghanaPhone);
    expect(call.content.startsWith("Abonten : ")).toBe(true);
    expect(call.content).toContain("/manage/my-events");

    const { data: rows } = await service
      .from("event_reschedule_text")
      .select("user_id, status, detail, provider_ref")
      .eq("reschedule_id", moved.data.rescheduleId);
    const byUser = Object.fromEntries((rows ?? []).map((r) => [r.user_id, r]));
    expect(byUser[ghana.id]).toMatchObject({
      status: "sent",
      provider_ref: "hubtel-1",
    });
    expect(byUser[abroad.id]).toMatchObject({
      status: "skipped",
      detail: "not_text_market",
    });

    // Nobody is texted twice.
    await dispatchRescheduleTextsCore({ budgetMs: 5_000 });
    expect(sms.send).toHaveBeenCalledTimes(1);
  });

  it("says a postponement, and stops when the kill switch is on", async () => {
    sms.send.mockReset();
    sms.send.mockResolvedValue({ ok: true, messageId: "hubtel-2" });
    const eventId = await eventWithHolders();
    const postponed = await rescheduleEventCore(
      organizer.client,
      organizer.id,
      organizer.id,
      { eventId, postpone: true, message: "The artist is ill." },
    );
    expect(postponed.status, postponed.message).toBe(200);
    await dispatchRescheduleTextsCore({ budgetMs: 10_000 });
    expect(sms.send).toHaveBeenCalledTimes(1);
    expect(
      (sms.send.mock.calls[0][0] as { content: string }).content,
    ).toContain("nouvelle date à venir");

    process.env.RESCHEDULE_TEXTS_KILL_SWITCH = "true";
    const other = await eventWithHolders();
    const moved = await rescheduleEventCore(
      organizer.client,
      organizer.id,
      organizer.id,
      {
        eventId: other,
        startsAt: inDays(11).toISOString(),
        endsAt: new Date(inDays(11).getTime() + 2 * HOUR).toISOString(),
        message: "New date.",
      },
    );
    expect(moved.status).toBe(200);
    if (moved.status !== 200) return;
    const { count } = await service
      .from("event_reschedule_text")
      .select("id", { count: "exact", head: true })
      .eq("reschedule_id", moved.data.rescheduleId);
    expect(count).toBe(0);
    process.env.RESCHEDULE_TEXTS_KILL_SWITCH = "";
  });
});
