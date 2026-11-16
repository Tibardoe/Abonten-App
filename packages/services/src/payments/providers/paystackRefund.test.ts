import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithTimeout = vi.fn();
vi.mock("@abonten/core/http/fetchWithTimeout", () => ({
  HTTP_TIMEOUTS: { paystackRead: 1_000, paystackWrite: 1_000 },
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args),
}));

import { REFUND_BUSY_WAITS_MS, refundTransaction } from "./paystackApi";
import type { ProviderAccount } from "./types";

const account = {
  provider: "paystack",
  countryCode: "GH",
  credentials: { secretKey: "sk_test_x", webhookSecret: "", publicKey: null },
  settlementCurrency: "GHS",
  currencies: ["GHS"],
  payoutsEnabled: false,
  accountRef: null,
  options: {},
} as unknown as ProviderAccount;

const busy = {
  status: false,
  message:
    "A refund is already being processed for this account. Please retry shortly.",
};
const accepted = { status: true, data: { status: "pending", id: 19188995 } };

function answer(status: number, json: unknown) {
  return { ok: status < 300, status, json: async () => json };
}

describe("refundTransaction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchWithTimeout.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("asks again when another refund on the account is in flight", async () => {
    fetchWithTimeout
      .mockResolvedValueOnce(answer(400, busy))
      .mockResolvedValueOnce(answer(400, busy))
      .mockResolvedValueOnce(answer(200, accepted));
    const pending = refundTransaction(account, "PSK-1", 4_000);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({
      status: "pending",
      id: "19188995",
    });
    expect(fetchWithTimeout).toHaveBeenCalledTimes(3);
  });

  it("gives up after the last pause", async () => {
    fetchWithTimeout.mockResolvedValue(answer(400, busy));
    const pending = refundTransaction(account, "PSK-1", 4_000);
    const settled = expect(pending).rejects.toThrow(/already being processed/);
    await vi.runAllTimersAsync();
    await settled;
    expect(fetchWithTimeout).toHaveBeenCalledTimes(
      REFUND_BUSY_WAITS_MS.length + 1,
    );
  });

  it("never asks again after any other refusal", async () => {
    fetchWithTimeout.mockResolvedValue(
      answer(400, {
        status: false,
        message: "Transaction has been fully reversed",
      }),
    );
    await expect(refundTransaction(account, "PSK-1", 4_000)).rejects.toThrow(
      /fully reversed/,
    );
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });
});
