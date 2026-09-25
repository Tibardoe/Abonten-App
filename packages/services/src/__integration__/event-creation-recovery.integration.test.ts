import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Production incident 2026-09-25: from 06:15:57 UTC (migration
// global_markets_domain_columns) to 17:24:52 UTC (deployment of 8e0103c2)
// no organizer could create an event — create_event runs with its caller's
// rights, reads the service-only market/currency tables, and the apps
// called it with the organizer's session. The fix calls it with the service
// role after the service has resolved the organizer, the market and the
// prices itself (postEventCore). This suite is the recovery gate: the whole
// organizer creation path, its refusals, and its behaviour under retries
// and concurrency, against the schema production now runs.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveEventDraftCore } from "../events/eventDraftCore";
import {
  type PostEventCoreInput,
  postEventCore,
} from "../events/postEventCore";
import { updateEventCore } from "../events/updateEventCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

function baseInput(over: Partial<PostEventCoreInput> = {}): PostEventCoreInput {
  const start = inDays(3);
  return {
    title: "Recovery gate event",
    description: "Created by the event-creation recovery suite.",
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
    ...over,
  };
}

describe("event creation after the 2026-09-25 incident", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let other: TestUser;

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, other] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
  });

  afterAll(async () => {
    for (const u of [organizer, other]) {
      await service.from("event").delete().eq("organizer_id", u.id);
      await service.from("drafts").delete().eq("user_id", u.id);
      await deleteTestUser(service, u.id);
    }
  });

  async function eventRow(id: string) {
    const { data: row, error } = await service
      .from("event")
      .select(
        "organizer_id, status, currency, country_code, timezone, featured, published_at, created_at, capacity, title",
      )
      .eq("id", id)
      .single();
    if (error || !row) throw new Error(`event ${id}: ${error?.message}`);
    const { data: tiers } = await service
      .from("ticket_type")
      .select("type, price, currency, quantity")
      .eq("event_id", id);
    const { data: codes } = await service
      .from("promo_code")
      .select("promo_code")
      .eq("event_id", id);
    return { ...row, ticket_type: tiers ?? [], promo_code: codes ?? [] };
  }

  it("the old path is closed: an organizer's own session cannot call create_event", async () => {
    const { error } = await organizer.client.rpc("create_event", {
      p_client_request_id: crypto.randomUUID(),
      p_organizer_id: organizer.id,
    } as never);
    expect(error?.code).toMatch(/42501|PGRST202/);
  });

  it("creates a paid event with the right owner, market, currency, status and times", async () => {
    const before = Date.now();
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput({
        promoCodes: [
          {
            promoCode: "RECOVER10",
            discount: 10,
            maximumUse: 5,
            expiryDate: inDays(2).toISOString(),
          },
        ],
        // A client-sent currency is ignored: the market decides.
        ...({ currency: "USD" } as object),
      }),
    );
    expect(created.status, created.message).toBe(200);
    if (created.status !== 200) return;
    const row = await eventRow(created.eventId);
    expect(row).toMatchObject({
      organizer_id: organizer.id,
      status: "published",
      currency: "GHS",
      country_code: "GH",
      timezone: "Africa/Accra",
      featured: false,
      capacity: 50,
    });
    expect(
      row.ticket_type.map((t) => [
        t.type,
        Number(t.price),
        t.currency,
        t.quantity,
      ]),
    ).toEqual([["SINGLE TICKET", 25, "GHS", 20]]);
    expect(row.promo_code.map((p) => p.promo_code)).toEqual(["RECOVER10"]);
    expect(new Date(row.created_at).getTime()).toBeGreaterThanOrEqual(
      before - 5_000,
    );
    expect(row.published_at).not.toBeNull();
  });

  it("creates a free event with the FREE tier and no promo codes", async () => {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput({ freeEvent: true, singleTicket: null }),
    );
    expect(created.status, created.message).toBe(200);
    if (created.status !== 200) return;
    const row = await eventRow(created.eventId);
    expect(row.ticket_type.map((t) => [t.type, Number(t.price)])).toEqual([
      ["FREE", 0],
    ]);
    expect(row.promo_code).toEqual([]);
  });

  it("publishes a saved draft and removes the draft", async () => {
    const draft = await saveEventDraftCore(organizer.client, organizer.id, {
      payload: { title: "Recovery gate draft", capacity: 50 },
    });
    expect(draft.status, draft.message).toBe(200);
    if (draft.status !== 200) return;
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput({ title: "Recovery gate draft", draftId: draft.data.draftId }),
    );
    expect(created.status, created.message).toBe(200);
    const { count } = await service
      .from("drafts")
      .select("id", { count: "exact", head: true })
      .eq("id", draft.data.draftId);
    expect(count).toBe(0);
  });

  it("edits an event; another organizer cannot", async () => {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput(),
    );
    if (created.status !== 200) throw new Error(created.message);
    const input = baseInput();
    const edit = {
      eventId: created.eventId,
      title: "Recovery gate event, edited",
      description: input.description,
      address: input.address,
      addressDetails: input.addressDetails,
      latitude: input.latitude,
      longitude: input.longitude,
      capacity: 60,
      category: input.category,
      types: input.types,
      checked: false,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
    };
    const mine = await updateEventCore(organizer.client, organizer.id, edit);
    expect(mine.status, mine.message).toBe(200);
    expect((await eventRow(created.eventId)).capacity).toBe(60);

    const theirs = await updateEventCore(other.client, other.id, {
      ...edit,
      title: "Hijacked",
    });
    expect(theirs.status).toBe(404);
    const { data: direct } = await other.client
      .from("event")
      .update({ title: "Hijacked" })
      .eq("id", created.eventId)
      .select("id");
    expect(direct).toEqual([]);
    expect((await eventRow(created.eventId)).title).not.toMatch(/Hijacked/);
  });

  it("refuses a venue in a market that is not live, and anywhere without a market", async () => {
    const paris = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput({
        address: "Rue de Rivoli, Paris",
        addressDetails: { country_code: "FR", city: "Paris" },
        latitude: 48.8606,
        longitude: 2.3376,
      }),
    );
    expect(paris.status).toBe(400);
    const saoPaulo = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput({
        address: "Avenida Paulista, São Paulo",
        addressDetails: { country_code: "BR", city: "São Paulo" },
        latitude: -23.5614,
        longitude: -46.6559,
      }),
    );
    expect(saoPaulo.status).toBe(400);
  });

  it("the database refuses a currency it does not know, even from the service", async () => {
    const { error } = await service.rpc("create_event", {
      p_client_request_id: crypto.randomUUID(),
      p_organizer_id: organizer.id,
      p_title: "Bad currency",
      p_slug: `bad-currency-${crypto.randomUUID()}`,
      p_description: "x",
      p_event_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
      p_event_category: "conference",
      p_event_type: ["Conferences"],
      p_latitude: 5.5566,
      p_longitude: -0.1969,
      p_address: { full_address: "Accra" },
      p_capacity: 10,
      p_website_url: null,
      p_flyer_public_id: "test/flyer",
      p_flyer_version: "1",
      p_starts_at: inDays(3).toISOString(),
      p_ends_at: inDays(4).toISOString(),
      p_require_registration: false,
      p_featured: false,
      p_specific_dates: null,
      p_ticket_types: null,
      p_promo_codes: null,
      p_receiving_account: null,
      p_place_id: null,
      p_country_code: "GH",
      p_timezone: "Africa/Accra",
      p_currency: "XYZ",
    } as never);
    expect(error?.message).toMatch(/Unknown currency/);
  });

  it("a restricted organizer can neither create nor edit", async () => {
    const created = await postEventCore(other.client, other.id, baseInput());
    if (created.status !== 200) throw new Error(created.message);
    await service.from("user_info").update({ status_id: 3 }).eq("id", other.id);
    try {
      const refused = await postEventCore(other.client, other.id, baseInput());
      expect(refused.status).toBe(403);
      const input = baseInput();
      const edit = await updateEventCore(other.client, other.id, {
        eventId: created.eventId,
        title: "Edited while banned",
        description: input.description,
        address: input.address,
        addressDetails: input.addressDetails,
        latitude: input.latitude,
        longitude: input.longitude,
        capacity: 50,
        category: input.category,
        types: input.types,
        checked: false,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
      });
      expect(edit.status).toBe(403);
      expect((await eventRow(created.eventId)).title).not.toMatch(/banned/);
    } finally {
      await service
        .from("user_info")
        .update({ status_id: 1 })
        .eq("id", other.id);
    }
  });

  it("a double-tapped Publish creates one event and answers both taps with it", async () => {
    const input = baseInput({ title: "Double tap" });
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        postEventCore(organizer.client, organizer.id, input),
      ),
    );
    const ids = new Set(
      results.map((r) => (r.status === 200 ? r.eventId : `error ${r.status}`)),
    );
    expect([...ids]).toHaveLength(1);
    expect([...ids][0]).not.toMatch(/^error/);
    const { count } = await service
      .from("event")
      .select("id", { count: "exact", head: true })
      .eq("client_request_id", input.clientRequestId);
    expect(count).toBe(1);
  });

  it("different submissions at the same moment each create their own event", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        postEventCore(
          organizer.client,
          organizer.id,
          baseInput({ title: `Parallel ${i}` }),
        ),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(
      new Set(results.map((r) => (r.status === 200 ? r.eventId : null))).size,
    ).toBe(8);
  });

  it("a failed creation leaves nothing behind, and the retry creates it once", async () => {
    const clientRequestId = crypto.randomUUID();
    const failed = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput({
        clientRequestId,
        promoCodes: [
          {
            promoCode: "TWICE",
            discount: 10,
            maximumUse: 5,
            expiryDate: inDays(2).toISOString(),
          },
          {
            promoCode: "twice",
            discount: 20,
            maximumUse: 5,
            expiryDate: inDays(2).toISOString(),
          },
        ],
      }),
    );
    expect(failed.status).toBe(409);
    const { count: none } = await service
      .from("event")
      .select("id", { count: "exact", head: true })
      .eq("client_request_id", clientRequestId);
    expect(none).toBe(0);

    const retry = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput({ clientRequestId }),
    );
    expect(retry.status, retry.message).toBe(200);
    const again = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput({ clientRequestId }),
    );
    expect(again.status).toBe(200);
    if (retry.status === 200 && again.status === 200) {
      expect(again.eventId).toBe(retry.eventId);
    }
  });
});
