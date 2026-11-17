import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const update = vi.fn();
vi.mock("../supabase/serviceClient", () => ({
  getSupabaseServiceClient: () => ({
    rpc,
    from: () => ({
      update: (values: unknown) => {
        update(values);
        const chain = {
          eq: () => chain,
          in: () => Promise.resolve({ error: null }),
        };
        return chain;
      },
    }),
  }),
}));
const refund = vi.fn();
vi.mock("./providers/registry", () => ({
  resolveProviderAccount: async () => ({
    provider: { refund: (...args: unknown[]) => refund(...args) },
    account: { provider: "paystack", countryCode: "GH" },
  }),
}));

import {
  ORPHAN_REFUND_RETRY_BATCH,
  retryOrphanRefundsCore,
} from "./orphanRefundRetryCore";

const rows = (refs: string[], attempts = 1) => ({
  data: refs.map((ref, i) => ({
    id: `row-${i}`,
    provider: "paystack",
    country_code: "GH",
    provider_reference: ref,
    provider_transaction_id: null,
    currency: "GHS",
    attempts,
  })),
  error: null,
});

describe("retryOrphanRefundsCore", () => {
  beforeEach(() => {
    rpc.mockReset();
    update.mockReset();
    refund.mockReset();
  });

  it("asks again for each one, one after another, and records the answer", async () => {
    rpc.mockResolvedValue(rows(["PSKCARD-a", "PSKCARD-b"], 2));
    let running = 0;
    let most = 0;
    refund.mockImplementation(
      async (_account, input: { reference: string }) => {
        running += 1;
        most = Math.max(most, running);
        await new Promise((r) => setTimeout(r, 1));
        running -= 1;
        if (input.reference === "PSKCARD-b") {
          throw new Error("Insufficient balance to process refund");
        }
        return { providerRefundId: "1" };
      },
    );

    const summary = await retryOrphanRefundsCore({
      deadline: Date.now() + 60_000,
    });

    expect(rpc).toHaveBeenCalledWith("orphan_refund_retry_candidates", {
      p_limit: ORPHAN_REFUND_RETRY_BATCH,
    });
    expect(refund.mock.calls.map((c) => c[1].reference)).toEqual([
      "PSKCARD-a",
      "PSKCARD-b",
    ]);
    expect(refund.mock.calls[0][1].amount).toBeNull();
    expect(most).toBe(1);
    expect(summary).toEqual({
      checked: 2,
      outcomes: { refund_requested: 1, refund_failed: 1 },
    });
    expect(update.mock.calls[0][0]).toMatchObject({
      status: "refund_requested",
      attempts: 3,
    });
    expect(update.mock.calls[1][0]).toMatchObject({
      status: "refund_failed",
      attempts: 3,
      last_error: "Insufficient balance to process refund",
    });
  });

  it("starts nothing after the deadline", async () => {
    rpc.mockResolvedValue(rows(["a", "b"]));
    let clock = 0;
    refund.mockImplementation(async () => {
      clock = 100;
      return { providerRefundId: "1" };
    });
    const summary = await retryOrphanRefundsCore({
      deadline: 50,
      now: () => clock,
    });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(summary.checked).toBe(1);
  });

  it("throws when the candidates cannot be read", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(
      retryOrphanRefundsCore({ deadline: Date.now() + 1000 }),
    ).rejects.toThrow("boom");
  });
});
