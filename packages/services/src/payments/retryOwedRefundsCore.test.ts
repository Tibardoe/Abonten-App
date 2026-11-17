import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("../supabase/serviceClient", () => ({
  getSupabaseServiceClient: () => ({ rpc }),
}));
const issueRefundCore = vi.fn();
vi.mock("../organizer/issueRefundCore", () => ({
  issueRefundCore: (...args: unknown[]) => issueRefundCore(...args),
}));

import {
  REFUND_RETRY_BATCH,
  retryOwedRefundsCore,
} from "./retryOwedRefundsCore";

const rows = (ids: string[]) => ({
  data: ids.map((id) => ({ transaction_id: id, failed_parts: 1 })),
  error: null,
});

describe("retryOwedRefundsCore", () => {
  beforeEach(() => {
    rpc.mockReset();
    issueRefundCore.mockReset();
  });

  it("asks for each owed refund, one after another", async () => {
    rpc.mockResolvedValue(rows(["a", "b", "c"]));
    let running = 0;
    let most = 0;
    issueRefundCore.mockImplementation(async (_svc, id: string) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 1));
      running -= 1;
      return id === "b"
        ? { status: 500, message: "refused" }
        : { status: 200, message: "ok" };
    });
    const summary = await retryOwedRefundsCore({
      deadline: Date.now() + 60_000,
    });
    expect(rpc).toHaveBeenCalledWith("refund_retry_candidates", {
      p_limit: REFUND_RETRY_BATCH,
    });
    expect(issueRefundCore.mock.calls.map((c) => c[1])).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(most).toBe(1);
    expect(summary).toEqual({ checked: 3, outcomes: { "200": 2, "500": 1 } });
  });

  it("starts nothing after the deadline", async () => {
    rpc.mockResolvedValue(rows(["a", "b"]));
    let clock = 0;
    issueRefundCore.mockImplementation(async () => {
      clock = 100;
      return { status: 200 };
    });
    const summary = await retryOwedRefundsCore({
      deadline: 50,
      now: () => clock,
    });
    expect(issueRefundCore).toHaveBeenCalledTimes(1);
    expect(summary.checked).toBe(1);
  });

  it("counts a refund that threw and carries on", async () => {
    rpc.mockResolvedValue(rows(["a", "b"]));
    issueRefundCore
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ status: 200 });
    const summary = await retryOwedRefundsCore({
      deadline: Date.now() + 60_000,
    });
    expect(summary.outcomes).toEqual({ threw: 1, "200": 1 });
  });

  it("fails loudly when the candidates cannot be read", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    await expect(
      retryOwedRefundsCore({ deadline: Date.now() + 60_000 }),
    ).rejects.toThrow("down");
    expect(issueRefundCore).not.toHaveBeenCalled();
  });
});
