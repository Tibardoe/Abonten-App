import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { addPaymentMethodCore } from "./paymentMethodCore";

// A stub for the three payment_method queries addPaymentMethodCore makes:
// the active-count head query, the existing-methods lookup, and the insert.
// Each resolves to whatever the test hands it.
function fakeClient(opts: {
  activeCount?: number;
  existing?: Record<string, unknown>[];
}): { client: SupabaseClient; insert: ReturnType<typeof vi.fn> } {
  const insert = vi.fn((row: Record<string, unknown>) => ({
    select: () => ({
      single: async () => ({ data: { id: "new", ...row }, error: null }),
    }),
  }));

  // Both reads are awaited after a chain of .eq() calls, so each has to be a
  // real promise that still exposes .eq() — Object.assign onto a resolved
  // promise gives that without hand-rolling a thenable.
  const resolved = <T>(value: T) => {
    const node: { eq: () => typeof node } & Promise<T> = Object.assign(
      Promise.resolve(value),
      { eq: () => node },
    );
    return node;
  };

  const from = () => ({
    select: (_cols: string, o?: { head?: boolean }) =>
      o?.head
        ? resolved({ count: opts.activeCount ?? 0, error: null })
        : resolved({ data: opts.existing ?? [], error: null }),
    insert,
  });

  return { client: { from } as unknown as SupabaseClient, insert };
}

const savedCard = (details: Record<string, unknown>, id = "card-1") => ({
  id,
  method_type: "card",
  details,
  is_default: true,
  created_at: "2026-08-27T00:00:00Z",
});

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
    const { client, insert } = fakeClient({
      existing: [
        savedCard({
          brand: "visa",
          last4: "4081",
          expiryMonth: 12,
          expiryYear: 2030,
        }),
      ],
    });
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

  // The regression the exact-containment match missed: Paystack returns the
  // brand with inconsistent case and trailing whitespace, and production
  // held a row saved as "visa " alongside one saved as "visa".
  it("spots a duplicate card whose brand differs only in case or whitespace", async () => {
    const { client, insert } = fakeClient({
      existing: [
        savedCard({
          brand: "visa ",
          last4: "4081",
          expiryMonth: 12,
          expiryYear: 2030,
        }),
      ],
    });
    const res = await addPaymentMethodCore(client, "u1", {
      type: "card",
      brand: "Visa",
      last4: "4081",
      expiryMonth: 12,
      expiryYear: 2030,
      authorizationCode: "AUTH_new",
      bank: "TEST BANK",
    });
    expect(res.status === 200 && res.data.id).toBe("card-1");
    expect(insert).not.toHaveBeenCalled();
  });

  it("trims the brand it stores", async () => {
    const { client, insert } = fakeClient({});
    await addPaymentMethodCore(client, "u1", {
      type: "card",
      brand: "visa ",
      last4: "4081",
      expiryMonth: 12,
      expiryYear: 2030,
      authorizationCode: "AUTH_x",
      bank: null,
    });
    const row = insert.mock.calls[0][0] as { details: { brand: string } };
    expect(row.details.brand).toBe("visa");
  });

  it("still saves a genuinely new card", async () => {
    const { client, insert } = fakeClient({ existing: [] });
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

  it("still saves a card that differs only by expiry", async () => {
    const { client, insert } = fakeClient({
      existing: [
        savedCard({
          brand: "visa",
          last4: "4081",
          expiryMonth: 12,
          expiryYear: 2030,
        }),
      ],
    });
    await addPaymentMethodCore(client, "u1", {
      type: "card",
      brand: "visa",
      last4: "4081",
      expiryMonth: 12,
      expiryYear: 2031,
      authorizationCode: "AUTH_x",
      bank: null,
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  // Mobile money had no duplicate check at all: saving the same wallet twice
  // put two identical entries in the checkout picker.
  it("returns the existing row instead of saving the same wallet twice", async () => {
    const { client, insert } = fakeClient({
      existing: [
        {
          id: "momo-1",
          method_type: "momo",
          details: {
            networkCode: "MTN",
            networkName: "MTN",
            phone: "+233241234567",
          },
          is_default: true,
          created_at: "2026-08-18T00:00:00Z",
        },
      ],
    });
    // Typed in local form this time, and with a different label — same wallet.
    const res = await addPaymentMethodCore(client, "u1", {
      type: "momo",
      networkCode: "MTN",
      networkName: "MTN",
      phone: "0241234567",
      label: "My other wallet",
    });
    expect(res.status === 200 && res.data.id).toBe("momo-1");
    expect(insert).not.toHaveBeenCalled();
  });

  it("still saves the same number on a different network", async () => {
    const { client, insert } = fakeClient({
      existing: [
        {
          id: "momo-1",
          method_type: "momo",
          details: {
            networkCode: "MTN",
            networkName: "MTN",
            phone: "+233241234567",
          },
          is_default: true,
          created_at: "2026-08-18T00:00:00Z",
        },
      ],
    });
    await addPaymentMethodCore(client, "u1", {
      type: "momo",
      networkCode: "VOD",
      networkName: "Telecel",
      phone: "0241234567",
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
