import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type HapniinMock,
  schemaProblems,
  startHapniinMock,
} from "./__fixtures__/hapniinMockServer";
import { classifyHapniinError, createHapniinAdapter } from "./hapniinAdapter";

// The Hapniin adapter against a stand-in built from Hapniin's published
// OpenAPI file: request bodies are checked against the spec's schemas,
// answers are built to them, and the documented rules (idempotency replay,
// own pricing, rate limit, errors) hold.

const KEY = "pk_sandbox_testkey";
const order = (quantity = 2) => ({
  partnerEventId: "evt_gjhf",
  buyer: {
    firstName: "Ama",
    lastName: "Mensah",
    email: "ama@example.com",
    phone: "+233201234567",
  },
  items: [{ productId: "prod_reg", quantity }],
});

describe("Hapniin adapter", () => {
  let mock: HapniinMock;
  let adapter: ReturnType<typeof createHapniinAdapter>;

  beforeAll(async () => {
    mock = await startHapniinMock([
      {
        id: "evt_gjhf",
        title: "Ghana-Jamaica Homecoming Festival",
        startDate: "2026-12-04T18:00:00.000Z",
        currency: "GHS",
        products: [
          { id: "prod_reg", name: "Regular", price: 250, stock: 5 },
          { id: "prod_vip", name: "VIP", price: 750 },
        ],
      },
      {
        id: "evt_seated",
        title: "Seated gala",
        startDate: "2026-12-05T18:00:00.000Z",
        currency: "GHS",
        seated: true,
        products: [{ id: "prod_seat", name: "Seat", price: 100 }],
      },
    ]);
    adapter = createHapniinAdapter({ baseUrl: mock.url });
  });

  afterAll(() => mock.close());
  beforeEach(() => {
    mock.requests.length = 0;
  });

  it("lists live, unseated events with their products", async () => {
    const res = await adapter.listEvents(KEY);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.map((e) => e.id)).toEqual(["evt_gjhf"]);
    expect(res.data[0]).toMatchObject({
      currency: "GHS",
      products: [
        { id: "prod_reg", name: "Regular", type: "TICKET", price: 250 },
        { id: "prod_vip", name: "VIP", type: "TICKET", price: 750 },
      ],
    });
    expect(mock.requests[0]).toMatchObject({
      method: "GET",
      path: "/api/partner/v1/events",
    });
  });

  it("registers a sale with a body the spec accepts and an Idempotency-Key", async () => {
    const res = await adapter.pushOrder(KEY, order(2), "abn-line1-g1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.attendeeCount).toBe(2);
    expect(res.data.status).toBe("PAID");
    const sent = mock.requests.at(-1);
    expect(sent?.idempotencyKey).toBe("abn-line1-g1");
    expect(sent?.problems).toEqual([]);
    // Prices are never sent: the partner prices the sale itself.
    expect(JSON.stringify(sent?.body)).not.toContain("price");
    expect(mock.orders.get(res.data.orderId)?.totalPrice).toBe(500);
  });

  it("replays the first answer for the same key instead of a second order", async () => {
    const first = await adapter.pushOrder(KEY, order(1), "abn-line2-g1");
    const again = await adapter.pushOrder(KEY, order(1), "abn-line2-g1");
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.data.orderId).toBe(first.data.orderId);
    expect(
      [...mock.orders.values()].filter((o) => o.id === first.data.orderId),
    ).toHaveLength(1);
  });

  it("reads each attendee's ticket code back", async () => {
    const pushed = await adapter.pushOrder(KEY, order(2), "abn-line3-g1");
    if (!pushed.ok) throw new Error("push failed");
    const res = await adapter.getOrder(KEY, pushed.data.orderId);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.attendees).toHaveLength(2);
    for (const a of res.data.attendees) {
      expect(a.code).toMatch(/^TCK-[A-Z0-9]+$/);
    }
    // An order made with another key is not visible (404, not 403).
    const other = await adapter.getOrder(
      "pk_sandbox_otherkey",
      pushed.data.orderId,
    );
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error.kind).toBe("not_found");
  });

  it("sorts the partner's refusals from what is worth retrying", async () => {
    const tooMany = await adapter.pushOrder(KEY, order(11), "abn-line4-g1");
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) {
      expect(tooMany.error).toMatchObject({
        kind: "refused",
        code: "INVALID_QUANTITY",
      });
    }
    // The five Regular places went to the sales above.
    const soldOut = await adapter.pushOrder(KEY, order(1), "abn-line4b-g1");
    expect(soldOut.ok).toBe(false);
    if (!soldOut.ok) {
      expect(soldOut.error).toMatchObject({
        kind: "refused",
        code: "SOLD_OUT",
      });
    }
    const seated = await adapter.pushOrder(
      KEY,
      { ...order(1), partnerEventId: "evt_seated" },
      "abn-line5-g1",
    );
    expect(seated.ok).toBe(false);
    if (!seated.ok) {
      expect(seated.error).toMatchObject({
        kind: "refused",
        code: "SEATED_EVENT_NOT_SUPPORTED",
      });
    }

    mock.failNext(1, 503, "UPSTREAM");
    const down = await adapter.pushOrder(KEY, order(1), "abn-line6-g1");
    expect(down.ok).toBe(false);
    if (!down.ok) expect(down.error.kind).toBe("retry");

    mock.failNext(1, 429, "RATE_LIMITED", 42);
    const limited = await adapter.listEvents(KEY);
    expect(limited.ok).toBe(false);
    if (!limited.ok) {
      expect(limited.error).toMatchObject({
        kind: "rate_limited",
        retryAfterSeconds: 42,
      });
    }

    mock.failNext(1, 409, "REQUEST_IN_PROGRESS");
    const busy = await adapter.pushOrder(KEY, order(1), "abn-line7-g1");
    if (!busy.ok) expect(busy.error.kind).toBe("in_progress");

    const badKey = await adapter.listEvents("sk_live_nope");
    expect(badKey.ok).toBe(false);
    if (!badKey.ok) {
      expect(badKey.error).toMatchObject({
        kind: "auth",
        code: "INVALID_API_KEY",
      });
    }
  });

  it("calls a stalled partner a retry, never a refusal", async () => {
    const slow = createHapniinAdapter({
      baseUrl: "http://10.255.255.1:9",
      readTimeoutMs: 200,
    });
    const res = await slow.listEvents(KEY);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(["TIMEOUT", "NETWORK"]).toContain(res.error.code);
    if (!res.ok) expect(res.error.kind).toBe("retry");
  });

  it("answers the partner's documented error codes the documented way", () => {
    expect(classifyHapniinError(400, "SOLD_OUT", "", null).kind).toBe(
      "refused",
    );
    expect(classifyHapniinError(403, "INSUFFICIENT_SCOPE", "", null).kind).toBe(
      "auth",
    );
    expect(classifyHapniinError(404, "ORDER_NOT_FOUND", "", null).kind).toBe(
      "not_found",
    );
    expect(classifyHapniinError(500, null, "", null)).toMatchObject({
      kind: "retry",
      code: "HTTP_500",
    });
  });

  it("builds answers the spec describes", () => {
    expect(
      schemaProblems("OrderRequest", {
        eventId: "evt",
        firstName: "A",
        lastName: "B",
        email: "a@b.c",
        items: [],
      }),
    ).toContain("OrderRequest.items needs at least 1 item(s)");
    expect(schemaProblems("OrderRequest", { eventId: "evt" })).toContain(
      "OrderRequest.firstName is required",
    );
  });
});

describe("Hapniin webhooks", () => {
  const adapter = createHapniinAdapter({ baseUrl: "http://127.0.0.1:9" });
  const body = JSON.stringify({
    event: "order.completed",
    timestamp: "2026-12-01T10:15:03.120Z",
    data: {
      orderId: "ord_7e2f9a",
      orderShortId: "o_7e2f9a",
      totalPrice: 500,
      currency: "GHS",
      commissionId: "com_1",
      commissionAmount: 50,
    },
  });
  const sign = (raw: string, secret: string) =>
    `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  const headers = (signature: string) => ({
    get: (name: string) =>
      ({
        "x-hapniin-signature": signature,
        "x-hapniin-event": "order.completed",
        "x-hapniin-delivery": "3f6a9c2e",
      })[name.toLowerCase()] ?? null,
  });

  it("accepts a delivery signed with one of the secrets", () => {
    const res = adapter.verifyWebhook(body, headers(sign(body, "whsec_b")), [
      "whsec_a",
      "whsec_b",
    ]);
    expect(res).toEqual({
      ok: true,
      event: {
        type: "order.completed",
        orderId: "ord_7e2f9a",
        orderShortId: "o_7e2f9a",
        deliveryId: "3f6a9c2e",
      },
    });
  });

  it("refuses a wrong signature, a re-serialised body and no secret", () => {
    expect(
      adapter.verifyWebhook(body, headers(sign(body, "other")), ["whsec_a"]),
    ).toEqual({ ok: false, reason: "signature" });
    const reformatted = JSON.stringify(JSON.parse(body), null, 2);
    expect(
      adapter.verifyWebhook(reformatted, headers(sign(body, "whsec_a")), [
        "whsec_a",
      ]),
    ).toEqual({ ok: false, reason: "signature" });
    expect(adapter.verifyWebhook(body, headers(sign(body, "")), [])).toEqual({
      ok: false,
      reason: "signature",
    });
  });
});
