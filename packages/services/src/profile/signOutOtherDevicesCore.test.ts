import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { signOutOtherDevicesCore } from "./signOutOtherDevicesCore";

// Unit-level: no DB. The auth sign-out and the two push-table deletes are
// recorded so the order, the scope and what is kept can be checked.

type Filter = [op: "eq" | "neq", column: string, value: string];

function fakeService(
  opts: {
    signOutError?: { status?: number; message: string } | null;
    deleteError?: { message: string } | null;
  } = {},
) {
  const calls: string[] = [];
  const deletes: Record<string, Filter[]> = {};
  const signOut = vi.fn(async (_jwt: string, _scope: string) => {
    calls.push("signOut");
    return { data: null, error: opts.signOutError ?? null };
  });
  const from = (table: string) => ({
    delete() {
      calls.push(`delete ${table}`);
      const filters: Filter[] = [];
      deletes[table] = filters;
      const builder = {
        eq(column: string, value: string) {
          filters.push(["eq", column, value]);
          return builder;
        },
        neq(column: string, value: string) {
          filters.push(["neq", column, value]);
          return builder;
        },
        // biome-ignore lint/suspicious/noThenProperty: a PostgREST builder is awaited like this
        then(resolve: (value: { error: unknown }) => void) {
          resolve({ error: opts.deleteError ?? null });
        },
      };
      return builder;
    },
  });
  const service = {
    auth: { admin: { signOut } },
    from,
  } as unknown as ServiceRoleClient;
  return { service, signOut, calls, deletes };
}

const USER = "4f9d3c2e-0000-4000-8000-000000000001";
const TOKEN = "header.payload.signature";

describe("signOutOtherDevicesCore", () => {
  it("ends the other sessions as the person, then their push registrations", async () => {
    const { service, signOut, calls, deletes } = fakeService();
    const result = await signOutOtherDevicesCore(
      USER,
      TOKEN,
      { keepDeviceToken: "ExponentPushToken[this-phone]" },
      service,
    );
    expect(result).toEqual({ status: 200 });
    expect(signOut).toHaveBeenCalledWith(TOKEN, "others");
    expect(calls[0]).toBe("signOut");
    expect(deletes.device_token).toEqual([
      ["eq", "user_id", USER],
      ["neq", "token", "ExponentPushToken[this-phone]"],
    ]);
    // Asked from a phone: every browser of this person is signed out.
    expect(deletes.web_push_subscription).toEqual([["eq", "user_id", USER]]);
  });

  it("keeps this browser's notifications when asked from the website", async () => {
    const { service, deletes } = fakeService();
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
    await signOutOtherDevicesCore(
      USER,
      TOKEN,
      { keepWebPushEndpoint: endpoint },
      service,
    );
    expect(deletes.web_push_subscription).toEqual([
      ["eq", "user_id", USER],
      ["neq", "endpoint", endpoint],
    ]);
    expect(deletes.device_token).toEqual([["eq", "user_id", USER]]);
  });

  it("ignores a keep value that is not a plain string", async () => {
    const { service, deletes } = fakeService();
    await signOutOtherDevicesCore(
      USER,
      TOKEN,
      { keepDeviceToken: { neq: "x" }, keepWebPushEndpoint: 42 },
      service,
    );
    expect(deletes.device_token).toEqual([["eq", "user_id", USER]]);
    expect(deletes.web_push_subscription).toEqual([["eq", "user_id", USER]]);
  });

  it("touches nothing when the session is not valid any more", async () => {
    const { service, calls } = fakeService({
      signOutError: { status: 403, message: "Session not found" },
    });
    const result = await signOutOtherDevicesCore(USER, TOKEN, {}, service);
    expect(result.status).toBe(401);
    expect(calls).toEqual(["signOut"]);
  });

  it("treats the auth server's 'session missing' answer as an ended session", async () => {
    const { service, calls } = fakeService({
      signOutError: new AuthSessionMissingError(),
    });
    const result = await signOutOtherDevicesCore(USER, TOKEN, {}, service);
    expect(result.status).toBe(401);
    expect(calls).toEqual(["signOut"]);
  });

  it("refuses without a token, before calling anything", async () => {
    const { service, calls } = fakeService();
    const result = await signOutOtherDevicesCore(USER, "", {}, service);
    expect(result.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("says it failed when the push clean-up fails, so it can be tried again", async () => {
    const { service } = fakeService({ deleteError: { message: "boom" } });
    const result = await signOutOtherDevicesCore(USER, TOKEN, {}, service);
    expect(result.status).toBe(500);
  });
});
