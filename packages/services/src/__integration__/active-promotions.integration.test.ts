import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listActivePromotionsCore } from "../promotions/activePromotionsCore";
import { insertEventPromotionCheckoutCore } from "../promotions/insertEventPromotionCheckoutCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Settings "Promotion Details" / mobile Overview (listActivePromotionsCore):
// live and scheduled promotions of what the caller owns are listed, active
// first; expired ones and other people's are not.

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const service = getServiceClient();
const svc = service as unknown as ServiceRoleClient;
let owner: TestUser;
let other: TestUser;
let ownEvent: string;
let otherEvent: string;

const HOUR = 3_600_000;

async function promote(
  user: TestUser,
  eventId: string,
  startsInHours: number,
  endsInHours: number,
) {
  const checkout = await insertEventPromotionCheckoutCore(
    user.client,
    user.id,
    eventId,
    1,
  );
  const checkoutId = (checkout as { checkoutId: string }).checkoutId;
  expect(checkoutId).toBeTruthy();
  const { error } = await svc.from("event_promotion").insert({
    event_id: eventId,
    tier_id: 1,
    starts_at: new Date(Date.now() + startsInHours * HOUR).toISOString(),
    ends_at: new Date(Date.now() + endsInHours * HOUR).toISOString(),
    promotion_checkout_id: checkoutId,
  } as never);
  expect(error).toBeNull();
}

beforeAll(async () => {
  owner = await createTestUser(service);
  other = await createTestUser(service);
  ownEvent = (
    await createTestEventWithTicketType(service, owner.id, { quantity: 5 })
  ).eventId;
  otherEvent = (
    await createTestEventWithTicketType(service, other.id, { quantity: 5 })
  ).eventId;
}, 60_000);

afterAll(async () => {
  await svc
    .from("event_promotion")
    .delete()
    .in("event_id", [ownEvent, otherEvent]);
  await deleteTestEvent(service, ownEvent);
  await deleteTestEvent(service, otherEvent);
  await deleteTestUser(service, owner.id);
  await deleteTestUser(service, other.id);
});

describe("listActivePromotionsCore", () => {
  it("is empty when nothing is promoted", async () => {
    const res = await listActivePromotionsCore(svc, owner.id);
    expect(res).toEqual({ status: 200, data: [] });
  });

  it("lists the caller's live and scheduled promotions, active first, and nothing expired or foreign", async () => {
    await promote(owner, ownEvent, 24, 72); // scheduled
    await promote(owner, ownEvent, -2, 48); // active
    await promote(owner, ownEvent, -72, -1); // expired
    await promote(other, otherEvent, -2, 48); // someone else's

    const res = await listActivePromotionsCore(svc, owner.id);
    expect(res.status).toBe(200);
    const rows = res.data ?? [];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.state)).toEqual(["active", "scheduled"]);
    for (const r of rows) {
      expect(r.resourceType).toBe("event");
      expect(r.resourceId).toBe(ownEvent);
      expect(Date.parse(r.endsAt)).toBeGreaterThan(Date.now());
    }
  });
});
