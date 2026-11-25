import { describe, expect, it } from "vitest";
import {
  type GatePartnerEvent,
  checkGateMapping,
  gateEventProblems,
  gateKeyMode,
  gateKeyModeProblem,
  gatePushBackoffMs,
  gatePushIdempotencyKey,
  isGateEnvName,
  splitBuyerName,
} from "./gateLinkRules";
import { ticketEntryCode, ticketEntryCodeText } from "./ticketEntryCode";

const partnerEvent: GatePartnerEvent = {
  id: "evt_9f2a1c",
  title: "Ghana-Jamaica Homecoming",
  startDate: "2026-12-04T18:00:00.000Z",
  currency: "GHS",
  products: [
    { id: "prod_reg", name: "Regular", type: "TICKET", price: 250 },
    { id: "prod_vip", name: "VIP", type: "TICKET", price: 750.5 },
    { id: "prod_tee", name: "T-shirt", type: "MERCHANDISE", price: 100 },
  ],
};

const abonten = {
  currency: "GHS",
  startsAt: "2026-12-04T18:00:00.000Z",
  ticketTypes: [
    { id: "tt-regular", price: 250 },
    { id: "tt-vip", price: 750.5 },
  ],
};

describe("checkGateMapping", () => {
  it("accepts every type mapped once to a ticket at the same price", () => {
    const check = checkGateMapping({
      abonten,
      partnerEvent,
      mapping: [
        { ticketTypeId: "tt-regular", partnerProductId: "prod_reg" },
        { ticketTypeId: "tt-vip", partnerProductId: "prod_vip" },
      ],
    });
    expect(check.problems).toEqual([]);
    expect(check.products).toEqual([
      {
        ticketTypeId: "tt-regular",
        partnerProductId: "prod_reg",
        partnerProductName: "Regular",
        partnerPrice: 250,
      },
      {
        ticketTypeId: "tt-vip",
        partnerProductId: "prod_vip",
        partnerProductName: "VIP",
        partnerPrice: 750.5,
      },
    ]);
    expect(check.warnings).toEqual([]);
  });

  it("refuses a price that differs by one pesewa", () => {
    const check = checkGateMapping({
      abonten: {
        ...abonten,
        ticketTypes: [
          { id: "tt-regular", price: 250 },
          { id: "tt-vip", price: 750.49 },
        ],
      },
      partnerEvent,
      mapping: [
        { ticketTypeId: "tt-regular", partnerProductId: "prod_reg" },
        { ticketTypeId: "tt-vip", partnerProductId: "prod_vip" },
      ],
    });
    expect(check.problems).toEqual([
      {
        code: "price",
        ticketTypeId: "tt-vip",
        partnerProductId: "prod_vip",
        abontenMinor: 75049,
        partnerMinor: 75050,
      },
    ]);
    expect(check.products).toEqual([]);
  });

  it("refuses an unmapped type, a non-ticket product and a duplicate", () => {
    const check = checkGateMapping({
      abonten,
      partnerEvent,
      mapping: [
        { ticketTypeId: "tt-regular", partnerProductId: "prod_tee" },
        { ticketTypeId: "tt-regular", partnerProductId: "prod_reg" },
      ],
    });
    const codes = check.problems.map((p) => p.code);
    expect(codes).toContain("not_a_ticket");
    expect(codes).toContain("duplicate_ticket_type");
    expect(codes).toContain("unmapped");
  });

  it("refuses another currency and a missing partner event", () => {
    expect(
      checkGateMapping({
        abonten,
        partnerEvent: { ...partnerEvent, currency: "NGN" },
        mapping: [
          { ticketTypeId: "tt-regular", partnerProductId: "prod_reg" },
          { ticketTypeId: "tt-vip", partnerProductId: "prod_vip" },
        ],
      }).problems[0],
    ).toEqual({ code: "currency", partner: "NGN", abonten: "GHS" });
    expect(
      checkGateMapping({ abonten, partnerEvent: null, mapping: [] }).problems,
    ).toEqual([{ code: "partner_event_missing" }]);
  });

  it("warns (without refusing) about a date more than a day apart", () => {
    const check = checkGateMapping({
      abonten: { ...abonten, startsAt: "2026-12-06T18:00:00.000Z" },
      partnerEvent,
      mapping: [
        { ticketTypeId: "tt-regular", partnerProductId: "prod_reg" },
        { ticketTypeId: "tt-vip", partnerProductId: "prod_vip" },
      ],
    });
    expect(check.problems).toEqual([]);
    expect(check.warnings.map((w) => w.code)).toEqual(["date"]);
  });
});

describe("gateEventProblems", () => {
  const base = {
    status: "published",
    postponedAt: null,
    seated: false,
    occurrences: 0,
    groupPrices: 0,
    hasSales: false,
    ticketTypes: [{ type: "Regular", price: 250 }],
  };

  it("passes a plain published single-date paid event", () => {
    expect(gateEventProblems(base)).toEqual([]);
  });

  it("refuses what a partner order cannot express one to one", () => {
    expect(
      gateEventProblems({
        ...base,
        seated: true,
        occurrences: 2,
        groupPrices: 1,
        hasSales: true,
        ticketTypes: [
          { type: "Open", price: 50, amountMode: "open" },
          { type: "Couple", price: 400, admits: 2 },
          { type: "Pass", price: 900, passShows: 3 },
          { type: "FREE", price: 0 },
        ],
      }),
    ).toEqual([
      "seated",
      "multi_date",
      "open_amount",
      "group_ticket",
      "pass",
      "group_prices",
      "free_ticket",
      "has_sales",
    ]);
  });
});

describe("keys", () => {
  it("reads the mode from the key's prefix", () => {
    expect(gateKeyMode("pk_live_abc")).toBe("live");
    expect(gateKeyMode("pk_sandbox_abc")).toBe("sandbox");
    expect(gateKeyMode("sk_test_abc")).toBe("unknown");
    expect(gateKeyMode("  ")).toBe("missing");
    expect(gateKeyMode(undefined)).toBe("missing");
  });

  it("matches the key to the deployment and the payments mode", () => {
    const prodLive = {
      paymentsMode: "live" as const,
      deploymentEnv: "production",
    };
    const preview = { paymentsMode: "test" as const, deploymentEnv: "preview" };
    expect(gateKeyModeProblem("live", prodLive)).toBeNull();
    expect(gateKeyModeProblem("sandbox", prodLive)).toBe(
      "sandbox_with_live_payments",
    );
    expect(gateKeyModeProblem("sandbox", preview)).toBeNull();
    expect(gateKeyModeProblem("live", preview)).toBe("live_off_production");
    expect(
      gateKeyModeProblem("live", { paymentsMode: "test", deploymentEnv: null }),
    ).toBe("live_with_test_payments");
    expect(gateKeyModeProblem("missing", prodLive)).toBe("missing");
  });

  it("accepts only the provider's own variable names", () => {
    expect(isGateEnvName("hapniin", "apiKey", "HAPNIIN_API_KEY")).toBe(true);
    expect(isGateEnvName("hapniin", "apiKey", "HAPNIIN_API_KEY_GJHF")).toBe(
      true,
    );
    expect(
      isGateEnvName("hapniin", "apiKey", "SUPABASE_SERVICE_ROLE_KEY"),
    ).toBe(false);
    expect(isGateEnvName("hapniin", "apiKey", "HAPNIIN_WEBHOOK_SECRET")).toBe(
      false,
    );
    expect(
      isGateEnvName("hapniin", "webhookSecret", "HAPNIIN_WEBHOOK_SECRET_2"),
    ).toBe(true);
  });
});

describe("sending", () => {
  it("derives the idempotency key from the checkout line", () => {
    const id = "6f1c2a8e-1b2c-4d3e-8f90-0a1b2c3d4e5f";
    expect(gatePushIdempotencyKey(id)).toBe(
      "abn-6f1c2a8e1b2c4d3e8f900a1b2c3d4e5f-g1",
    );
    expect(gatePushIdempotencyKey(id, 2)).toBe(
      "abn-6f1c2a8e1b2c4d3e8f900a1b2c3d4e5f-g2",
    );
    // Same line, same key: a retry is the same request.
    expect(gatePushIdempotencyKey(id)).toBe(gatePushIdempotencyKey(id));
  });

  it("backs off, and waits as long as the partner asks", () => {
    expect(gatePushBackoffMs(1)).toBe(60_000);
    expect(gatePushBackoffMs(3)).toBe(5 * 60_000);
    expect(gatePushBackoffMs(50)).toBe(360 * 60_000);
    expect(gatePushBackoffMs(1, 300)).toBe(300_000);
    expect(gatePushBackoffMs(0)).toBe(60_000);
  });

  it("splits one name field into the first and last name the partner wants", () => {
    expect(splitBuyerName("Ama Serwaa Mensah")).toEqual({
      firstName: "Ama",
      lastName: "Serwaa Mensah",
    });
    expect(splitBuyerName("Kwesi")).toEqual({
      firstName: "Kwesi",
      lastName: "Kwesi",
    });
    expect(splitBuyerName("   ")).toBeNull();
    expect(splitBuyerName(null)).toBeNull();
  });
});

describe("ticketEntryCode", () => {
  const own = {
    ticket_code: "TKT-ABCD2345EFGH",
    qr_public_id: "tickets_qr_codes/x",
    qr_version: "1",
  };

  it("is Abonten's code for an ordinary ticket", () => {
    expect(ticketEntryCode(own)).toEqual({
      kind: "abonten",
      code: "TKT-ABCD2345EFGH",
      qrPublicId: "tickets_qr_codes/x",
      qrVersion: "1",
    });
  });

  it("is the partner's code once it arrived, and on its way before", () => {
    expect(
      ticketEntryCode({
        ...own,
        partner_gate: "hapniin",
        partner_code: "TCK-A1B2C3",
        partner_qr_public_id: "tickets_qr_codes/gate-hapniin-TCK-A1B2C3",
        partner_qr_version: "2",
      }),
    ).toEqual({
      kind: "partner",
      provider: "hapniin",
      code: "TCK-A1B2C3",
      qrPublicId: "tickets_qr_codes/gate-hapniin-TCK-A1B2C3",
      qrVersion: "2",
    });
    expect(ticketEntryCode({ ...own, partner_gate: "hapniin" })).toEqual({
      kind: "partner_pending",
      provider: "hapniin",
    });
    // Never Abonten's own code for a partner ticket.
    expect(ticketEntryCodeText({ ...own, partner_gate: "hapniin" })).toBeNull();
  });
});
