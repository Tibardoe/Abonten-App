import { describe, expect, it } from "vitest";
import { getServiceClient } from "./setupClient";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Audit 2026-09-26: nine SQL functions converted money with a fixed * 100,
// right only for two-decimal currencies (migration 20260926100500). They
// now scale by public.currency_scale(currency). This pins the helper.

describe("currency_scale", () => {
  const service = getServiceClient();

  it("is 10 ^ the currency's minor units", async () => {
    for (const [code, scale] of [
      ["GHS", 100],
      ["XOF", 1],
      ["KWD", 1000],
    ] as const) {
      const { data, error } = await service.rpc(
        "currency_scale" as never,
        {
          p_currency: code,
        } as never,
      );
      expect(error, code).toBeNull();
      expect(Number(data), code).toBe(scale);
    }
  });

  it("falls back to the default market's currency, and refuses an unknown one", async () => {
    const empty = await service.rpc(
      "currency_scale" as never,
      {
        p_currency: null,
      } as never,
    );
    expect(Number(empty.data)).toBe(100);
    const unknown = await service.rpc(
      "currency_scale" as never,
      {
        p_currency: "ZZZ",
      } as never,
    );
    expect(unknown.error?.message).toMatch(/Unknown currency/);
  });

  it("agrees with major_to_minor for a zero-decimal currency", async () => {
    const { data } = await service.rpc(
      "major_to_minor" as never,
      {
        p_amount: 5000,
        p_currency: "XOF",
      } as never,
    );
    expect(Number(data)).toBe(5000);
  });
});
