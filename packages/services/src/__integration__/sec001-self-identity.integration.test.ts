import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// SEC-001 (docs/audit/01-limitations-register.md): these four SECURITY
// DEFINER functions take no target-user argument at all -- each only ever
// answers "is auth.uid() an admin/staff member", so there's no cross-user
// call to attempt. What actually needs proving is that an ordinary,
// non-admin user gets a plain negative answer (false / empty array), never
// an error and never someone else's admin status.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("SEC-001: admin/staff self-identity SECURITY DEFINER functions", () => {
  let service: SupabaseClient<Database>;
  let ordinaryUser: TestUser;

  beforeEach(async () => {
    service = getServiceClient();
    ordinaryUser = await createTestUser(service);
  });

  afterEach(async () => {
    await deleteTestUser(service, ordinaryUser.id);
  });

  it("admin_effective_permissions returns an empty array for a non-admin", async () => {
    const { data, error } = await ordinaryUser.client.rpc(
      "admin_effective_permissions",
    );
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("admin_has_permission returns false for a non-admin", async () => {
    const { data, error } = await ordinaryUser.client.rpc(
      "admin_has_permission",
      { p_permission: "users.ban" },
    );
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("is_admin returns false for a non-admin", async () => {
    const { data, error } = await ordinaryUser.client.rpc("is_admin");
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("is_staff returns false for a non-admin", async () => {
    const { data, error } = await ordinaryUser.client.rpc("is_staff");
    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});
