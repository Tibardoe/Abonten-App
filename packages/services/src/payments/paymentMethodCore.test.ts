import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { addPaymentMethodCore } from "./paymentMethodCore";

// A chainable stub for the payment_method queries addPaymentMethodCore
// makes: the active-count head query, the duplicate-card lookup, and the
// insert. Each resolves to whatever the test hands it.
function fakeClient(opts: {
  activeCount?: number;
  existingCard?: Record<string, unknown> | null;
}): { client: SupabaseClient; insert: ReturnType<typeof vi.fn> } {
  const insert = vi.fn((row: Record<string, unknown>) => ({
    select: () => ({
      single: async () => ({ data: { id: "new", ...row }, error: null }),
    }),
  }));
  const from = () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: (_cols: string, o?: { head?: boolean }) => {
        if (o?.head) {
          // The count query is awaited directly, so it must be a real
          // promise that still exposes the .eq() builder method.
          const head = Object.assign(
            Promise.resolve({ count: opts.activeCount ?? 0, error: null }),
            { eq: () => head },
          );
          return head;
        }
        return chain;
      },
      eq: self,
      contains: self,
      limit: self,
      maybeSingle: async () => ({
        data: opts.existingCard ?? null,
        error: null,
      }),
      insert,
    });
    return chain;
  };
  return { client: { from } as unknown as SupabaseClient, insert };
}

describe("addPaymentMethodCore", () => {
  it("stores a mobile-money number as E.164 whatever form was typed", async () => {
    const { client, insert } = fakeClient({});
    const res = await addPaymentMethodCore(client, "u1", {
      type: "momo",
      networkCode: "MTN",
      networkName: "MTN",
      phone: "0241234567",
    });
    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0] as { details: { phone: string } };
    expect(row.details.phone).toBe("+233241234567");
  });

  it("leaves an already-international number unchanged", async () => {
    const { client, insert } = fakeClient({});
    await addPaymentMethodCore(client, "u1", {
      type: "momo",
      networkCode: "MTN",
      networkName: "MTN",
      phone: "+233551234987",
    });
    const row = insert.mock.calls[0][0] as { details: { phone: string } };
    expect(row.details.phone).toBe("+233551234987");
  });

  it("returns the existing row instead of saving an identical card twice", async () => {
    const existing = {
      id: "card-1",
      method_type: "card",
      details: {
        brand: "visa",
        last4: "4081",
        expiryMonth: 12,
        expiryYear: 2030,
      },
      is_default: true,
      created_at: "2026-08-27T00:00:00Z",
    };
    const { client, insert } = fakeClient({ existingCard: existing });
    const res = await addPaymentMethodCore(client, "u1", {
      type: "card",
      brand: "visa",
      last4: "4081",
      expiryMonth: 12,
      expiryYear: 2030,
      authorizationCode: "AUTH_new",
      bank: "TEST BANK",
    });
    expect(res.status).toBe(200);
    expect(res.status === 200 && res.data.id).toBe("card-1");
    expect(insert).not.toHaveBeenCalled();
  });

  it("still saves a genuinely new card", async () => {
    const { client, insert } = fakeClient({ existingCard: null });
    const res = await addPaymentMethodCore(client, "u1", {
      type: "card",
      brand: "mastercard",
      last4: "0002",
      expiryMonth: 1,
      expiryYear: 2031,
      authorizationCode: "AUTH_x",
      bank: null,
    });
    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
