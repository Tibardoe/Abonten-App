import { describe, expect, it } from "vitest";
import { parseVerifyResponse } from "./paystackApi";

// The exact field shape Paystack's /transaction/verify returned on
// 2026-09-25 for a hosted checkout page that was initialized and never
// opened (values replaced). Its `authorization` is an empty object; the
// strict parser refused it, and finalizePayment treated the refusal as a
// provider outage — the attempt was never closed.
const abandoned = {
  status: true,
  message: "Verification successful",
  data: {
    id: 123456789,
    domain: "test",
    status: "abandoned",
    reference: "PSK-00000000-0000-0000-0000-000000000000",
    receipt_number: null,
    amount: 105,
    message: null,
    gateway_response: "The transaction was not completed",
    gateway_response_code: null,
    response_code: null,
    paid_at: null,
    created_at: "2026-09-25T22:03:00.000Z",
    channel: "card",
    currency: "GHS",
    ip_address: "0.0.0.0",
    metadata: "",
    log: null,
    fees: null,
    fees_split: null,
    authorization: {},
    customer: {
      id: 1,
      first_name: null,
      last_name: null,
      email: "buyer@example.com",
      customer_code: "CUS_x",
      phone: null,
      metadata: null,
      risk_action: "default",
      international_format_phone: null,
    },
    plan: null,
    split: {},
    order_id: null,
    paidAt: null,
    createdAt: "2026-09-25T22:03:00.000Z",
    requested_amount: 105,
    pos_transaction_data: null,
    source: null,
    fees_breakdown: null,
    connect: null,
    transaction_date: "2026-09-25T22:03:00.000Z",
    plan_object: {},
    subaccount: {},
  },
};

describe("Paystack verify response", () => {
  it("accepts an abandoned charge whose authorization is an empty object", () => {
    const data = parseVerifyResponse(abandoned);
    expect(data).not.toBeNull();
    expect(data?.status).toBe("abandoned");
    expect(data?.amount).toBe(105);
    expect(data?.currency).toBe("GHS");
    expect(data?.authorization).toBeNull();
  });

  it("keeps a real card authorization", () => {
    const paid = {
      ...abandoned,
      data: {
        ...abandoned.data,
        status: "success",
        paid_at: "2026-09-25T22:04:00.000Z",
        fees: 2,
        authorization: {
          authorization_code: "AUTH_x",
          bin: "408408",
          last4: "4081",
          exp_month: "12",
          exp_year: "2030",
          channel: "card",
          card_type: "visa",
          bank: "TEST BANK",
          reusable: true,
        },
      },
    };
    const data = parseVerifyResponse(paid);
    expect(data?.status).toBe("success");
    expect(data?.authorization?.authorization_code).toBe("AUTH_x");
    expect(data?.fees).toBe(2);
  });

  it("still refuses a body that is not a verify response", () => {
    expect(parseVerifyResponse({ status: true, data: { id: 1 } })).toBeNull();
    expect(parseVerifyResponse(null)).toBeNull();
  });
});
