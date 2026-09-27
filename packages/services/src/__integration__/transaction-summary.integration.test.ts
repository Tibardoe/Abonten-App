import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// 2026-09-27: get_user_transaction_summary returned no row at all for a
// person with no paid purchase in the period (money_rows CROSS JOIN counts,
// with money_rows empty), and the web and app summary tiles showed "We
// couldn't load your transaction summary" to every new customer. Migration
// 20260927015944 adds a zero row. This pins it.

describe("get_user_transaction_summary", () => {
  const service = getServiceClient();
  let buyer: TestUser;

  beforeAll(async () => {
    buyer = await createTestUser(service);
  });

  afterAll(async () => {
    await deleteTestUser(service, buyer.id);
  });

  it("returns one zero row, with its counts, for someone who has bought nothing", async () => {
    for (const [start, end] of [
      [null, null],
      [
        new Date(Date.now() - 30 * 86_400_000).toISOString(),
        new Date().toISOString(),
      ],
    ]) {
      const { data, error } = await buyer.client.rpc(
        "get_user_transaction_summary" as never,
        { p_start: start, p_end: end } as never,
      );
      expect(error).toBeNull();
      const rows = data as unknown as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(1);
      expect(rows[0].currency).toBeTruthy();
      expect(Number(rows[0].amount_spent)).toBe(0);
      expect(Number(rows[0].total_transactions)).toBe(0);
    }
  });
});
