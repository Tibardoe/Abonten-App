// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Signing in with a phone number must not sign the person out anywhere else.
// Setting an account's password through the Admin API ends every session it
// has, and phone sign-in used to set a new random password each time, so a
// sign-in on the website or a second phone signed the app out on every
// other device. These run against the real local auth server.
//
// The local stack has phone logins switched off (supabase/config.toml), so
// the account also gets an email and the attempts sign in with that. The
// password grant, and what a password change does to sessions, are the same
// for both identifiers; production signs in with the phone number.
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findOrCreateUserByPhone,
  signInVerifiedPhoneUser,
} from "../profile/phoneAuthCore";
import { getServiceClient } from "./setupClient";

// A Ghana number no real person has (the 0 after the network code).
const E164 = "+233201234571";
const EMAIL = "phone-sessions@example.test";

/** A fresh client, like a separate phone or browser. */
function device() {
  return createClient(
    process.env.SUPABASE_TEST_URL ?? "",
    process.env.SUPABASE_TEST_ANON_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function signInOnNewDevice(userId: string): Promise<Session> {
  const client = device();
  const signedIn = await signInVerifiedPhoneUser(userId, (password) =>
    client.auth.signInWithPassword({ email: EMAIL, password }),
  );
  if (!signedIn.ok) throw new Error(signedIn.message);
  const session = signedIn.result.data.session;
  if (!session) throw new Error("no session");
  return session;
}

/** Whether the auth server still knows this session. */
async function stillSignedIn(session: Session): Promise<boolean> {
  const { error } = await device().auth.getUser(session.access_token);
  return !error;
}

describe("phone sign-in keeps the person's other devices signed in", () => {
  const service = getServiceClient();
  const saved: Record<string, string | undefined> = {};
  let userId = "";

  beforeAll(async () => {
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ])
      saved[name] = process.env[name];
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

    const found = await findOrCreateUserByPhone(E164);
    if ("error" in found) throw new Error(found.error);
    userId = found.userId;
    const { error } = await service.auth.admin.updateUserById(userId, {
      email: EMAIL,
      email_confirm: true,
    });
    if (error) throw error;
  });

  afterAll(async () => {
    if (userId) await service.auth.admin.deleteUser(userId);
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("setting the password through the Admin API ends the account's sessions (why the rule exists)", async () => {
    const phone = await signInOnNewDevice(userId);
    expect(await stillSignedIn(phone)).toBe(true);

    await service.auth.admin.updateUserById(userId, {
      password: `old-random-${crypto.randomUUID()}`,
    });

    expect(await stillSignedIn(phone)).toBe(false);
  });

  it("signs in after the password was set some other way (older builds), once", async () => {
    // The previous test left a random password, as the old rule did.
    const first = await signInOnNewDevice(userId);
    expect(await stillSignedIn(first)).toBe(true);
  });

  it("a second sign-in, on the website or another phone, leaves the first one signed in", async () => {
    const phone = await signInOnNewDevice(userId);
    const website = await signInOnNewDevice(userId);
    const secondPhone = await signInOnNewDevice(userId);

    expect(await stillSignedIn(phone)).toBe(true);
    expect(await stillSignedIn(website)).toBe(true);
    expect(await stillSignedIn(secondPhone)).toBe(true);

    // And the first phone can still renew its session later.
    const { data, error } = await device().auth.refreshSession({
      refresh_token: phone.refresh_token,
    });
    expect(error).toBeNull();
    expect(data.session?.user.id).toBe(userId);
  });

  it("signing out on one device leaves the others signed in", async () => {
    const phone = await signInOnNewDevice(userId);
    const otherClient = device();
    const other = await signInOnNewDevice(userId);
    await otherClient.auth.setSession({
      access_token: other.access_token,
      refresh_token: other.refresh_token,
    });

    await otherClient.auth.signOut({ scope: "local" });

    expect(await stillSignedIn(other)).toBe(false);
    expect(await stillSignedIn(phone)).toBe(true);
  });
});
