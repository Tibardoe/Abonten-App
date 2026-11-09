// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// "Sign out of other devices" (Settings › Security) against the real local
// auth server: the device asking stays signed in and keeps its
// notifications; every other session ends, and the other devices' push
// registrations go with it.
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signOutOtherDevicesCore } from "../profile/signOutOtherDevicesCore";
import { getServiceClient } from "./setupClient";

const EMAIL = "sign-out-others@example.test";
const PASSWORD = "test-password-not-real-12345";

function device() {
  return createClient(
    process.env.SUPABASE_TEST_URL ?? "",
    process.env.SUPABASE_TEST_ANON_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function signIn(): Promise<Session> {
  const { data, error } = await device().auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (error || !data.session) throw error ?? new Error("no session");
  return data.session;
}

async function stillSignedIn(session: Session): Promise<boolean> {
  const { error } = await device().auth.getUser(session.access_token);
  return !error;
}

describe("sign out of other devices", () => {
  const service = getServiceClient();
  const saved: Record<string, string | undefined> = {};
  let userId = "";
  let otherUserId = "";

  beforeAll(async () => {
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ])
      saved[name] = process.env[name];
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

    for (const email of [EMAIL, `other-${EMAIL}`]) {
      const { data, error } = await service.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data.user) throw error ?? new Error("no user");
      if (email === EMAIL) userId = data.user.id;
      else otherUserId = data.user.id;
    }
  });

  afterAll(async () => {
    for (const id of [userId, otherUserId]) {
      if (id) await service.auth.admin.deleteUser(id);
    }
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("keeps this phone signed in and notified, and ends the rest", async () => {
    const thisPhone = await signIn();
    const oldPhone = await signIn();
    const laptop = await signIn();

    await service.from("device_token").insert([
      {
        user_id: userId,
        token: "ExponentPushToken[this-phone]",
        platform: "ios",
      },
      {
        user_id: userId,
        token: "ExponentPushToken[old-phone]",
        platform: "android",
      },
      {
        user_id: otherUserId,
        token: "ExponentPushToken[someone-else]",
        platform: "ios",
      },
    ]);
    await service.from("web_push_subscription").insert({
      user_id: userId,
      endpoint: "https://push.example.test/laptop",
      p256dh: "p256dh-key-for-tests-0123456789",
      auth: "auth-secret-0123",
    });

    const result = await signOutOtherDevicesCore(
      userId,
      thisPhone.access_token,
      {
        keepDeviceToken: "ExponentPushToken[this-phone]",
      },
    );
    expect(result).toEqual({ status: 200 });

    expect(await stillSignedIn(thisPhone)).toBe(true);
    expect(await stillSignedIn(oldPhone)).toBe(false);
    expect(await stillSignedIn(laptop)).toBe(false);

    const { data: tokens } = await service
      .from("device_token")
      .select("token")
      .in("user_id", [userId, otherUserId])
      .order("token");
    expect(tokens?.map((row) => row.token)).toEqual([
      "ExponentPushToken[someone-else]",
      "ExponentPushToken[this-phone]",
    ]);
    const { count } = await service
      .from("web_push_subscription")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    expect(count).toBe(0);

    // This phone can still renew its session afterwards.
    const { error } = await device().auth.refreshSession({
      refresh_token: thisPhone.refresh_token,
    });
    expect(error).toBeNull();

    await service
      .from("device_token")
      .delete()
      .in("user_id", [userId, otherUserId]);
  });

  it("refuses a session that has already ended, and changes nothing", async () => {
    const ended = await signIn();
    const client = device();
    await client.auth.setSession({
      access_token: ended.access_token,
      refresh_token: ended.refresh_token,
    });
    await client.auth.signOut({ scope: "local" });
    const kept = await signIn();

    const result = await signOutOtherDevicesCore(
      userId,
      ended.access_token,
      {},
    );
    expect(result.status).toBe(401);
    expect(await stillSignedIn(kept)).toBe(true);
  });
});
