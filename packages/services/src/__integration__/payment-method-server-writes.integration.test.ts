import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Migration payment_method_server_writes_only: a signed-in user can read
// their saved payment methods but can no longer insert, change or delete
// them through the Data API (that skipped the card verification and the
// mobile money number check). Removing a method and choosing the default
// still work through @abonten/services, which writes with the service role.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  removePaymentMethodCore,
  setDefaultPaymentMethodCore,
} from "../payments/paymentMethodCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("payment methods are written by the service only", () => {
  let service: SupabaseClient<Database>;
  let user: TestUser;
  const saved: Record<string, string | undefined> = {};
  let first: string;
  let second: string;

  async function seed(phone: string, isDefault: boolean): Promise<string> {
    const { data, error } = await service
      .from("payment_method")
      .insert({
        user_id: user.id,
        method_type: "momo",
        details: { networkCode: "MTN", networkName: "MTN", phone },
        is_default: isDefault,
        status: "active",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message);
    return data.id;
  }

  beforeAll(async () => {
    service = getServiceClient();
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ])
      saved[name] = process.env[name];
    // The cores write through their own service-role client.
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
    user = await createTestUser(service);
    first = await seed("+233241234561", true);
    second = await seed("+233241234562", false);
  });

  afterAll(async () => {
    await service.from("payment_method").delete().eq("user_id", user.id);
    await deleteTestUser(service, user.id);
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("still lets the owner read their own methods", async () => {
    const { data, error } = await user.client
      .from("payment_method")
      .select("id")
      .eq("user_id", user.id);
    expect(error).toBeNull();
    expect((data ?? []).map((r) => r.id).sort()).toEqual(
      [first, second].sort(),
    );
  });

  it("refuses a direct insert", async () => {
    const { error } = await user.client.from("payment_method").insert({
      user_id: user.id,
      method_type: "momo",
      details: {
        networkCode: "MTN",
        networkName: "MTN",
        phone: "+233241234569",
      },
      is_default: false,
      status: "active",
    });
    expect(error).not.toBeNull();
    const { count } = await service
      .from("payment_method")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    expect(count).toBe(2);
  });

  it("refuses a direct change of a saved number, and a direct delete", async () => {
    const { error: updateError } = await user.client
      .from("payment_method")
      .update({
        details: {
          networkCode: "MTN",
          networkName: "MTN",
          phone: "+233209999999",
        },
      })
      .eq("id", first);
    expect(updateError).not.toBeNull();

    const { error: deleteError } = await user.client
      .from("payment_method")
      .delete()
      .eq("id", first);
    expect(deleteError).not.toBeNull();

    const { data } = await service
      .from("payment_method")
      .select("details")
      .eq("id", first)
      .single();
    expect((data?.details as { phone: string }).phone).toBe("+233241234561");
  });

  it("changes the default and removes a method through the service", async () => {
    const made = await setDefaultPaymentMethodCore(
      user.client,
      user.id,
      second,
    );
    expect(made.status).toBe(200);

    const removed = await removePaymentMethodCore(user.client, user.id, second);
    expect(removed.status).toBe(200);

    const { data } = await service
      .from("payment_method")
      .select("id, status, is_default")
      .eq("user_id", user.id)
      .order("created_at");
    expect(data).toEqual([
      { id: first, status: "active", is_default: true },
      { id: second, status: "removed", is_default: false },
    ]);
  });
});
