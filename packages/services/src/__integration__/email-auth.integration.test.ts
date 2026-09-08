import type { Database } from "@abonten/types/database.types";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Email one-time-code sign-in adds no migration and no custom provider — it
// leans on mechanisms this repo already has. These tests pin the ones the
// feature depends on:
//   * the on_auth_user_created trigger makes exactly one user_info row for a
//     new email user, with status_id = 1 (AUTH-EMAIL-001 / 015);
//   * auth.users.email is unique — a second account can't be created for the
//     same address, and asking for a code for an existing address doesn't
//     fork a new row (AUTH-EMAIL-002 / 014);
//   * changing/adding an email on a live session keeps that session and
//     doesn't duplicate the profile (AUTH-EMAIL-011);
//   * the consume_rate_limit primitive the send cap is built on actually
//     caps (AUTH-EMAIL-007);
//   * an email-authenticated user is still fully bound by RLS
//     (AUTH-EMAIL-016).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.SUPABASE_TEST_URL as string,
    process.env.SUPABASE_TEST_ANON_KEY as string,
    { auth: { persistSession: false } },
  );
}

// auth.users isn't in the generated Database types (no integration test
// touches the auth schema over PostgREST), so count via the Admin API.
async function countAuthUsersWithEmail(
  service: SupabaseClient<Database>,
  email: string,
): Promise<number> {
  const { data, error } = await service.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users.filter(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  ).length;
}

describe("email OTP sign-in — mechanisms it relies on", () => {
  let service: SupabaseClient<Database>;
  const createdUserIds: string[] = [];

  beforeAll(() => {
    service = getServiceClient();
  });

  afterEach(async () => {
    for (const id of createdUserIds.splice(0)) {
      await deleteTestUser(service, id).catch(() => {});
    }
  });

  it("a new email user gets exactly one active user_info row (AUTH-EMAIL-001/015)", async () => {
    const email = `email-otp-new-${Date.now()}@example.test`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    expect(error).toBeNull();
    const userId = data.user?.id as string;
    createdUserIds.push(userId);

    const { data: rows, error: rowErr } = await service
      .from("user_info")
      .select("id, status_id, username, username_is_generated")
      .eq("id", userId);

    expect(rowErr).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows?.[0].status_id).toBe(1);
    expect((rows?.[0].username ?? "").length).toBeGreaterThanOrEqual(3);
    expect(rows?.[0].username_is_generated).toBe(true);
  });

  it("a second account cannot be created for the same email (AUTH-EMAIL-014)", async () => {
    const email = `email-otp-dup-${Date.now()}@example.test`;
    const first = await service.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    createdUserIds.push(first.data.user?.id as string);

    const second = await service.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    expect(second.error).not.toBeNull();

    expect(await countAuthUsersWithEmail(service, email)).toBe(1);
  });

  it("asking for a code for an existing email does not fork a new user (AUTH-EMAIL-002)", async () => {
    const email = `email-otp-existing-${Date.now()}@example.test`;
    const created = await service.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    createdUserIds.push(created.data.user?.id as string);

    // Local SMTP captures the mail; we only care that this doesn't create a
    // second row for an address that already exists.
    const { error } = await anonClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    // Either it succeeds (mail queued) or it's rate-limited — never an
    // account fork.
    if (error) expect([429, 400]).toContain(error.status);

    expect(await countAuthUsersWithEmail(service, email)).toBe(1);
  });

  it("adding/changing an email on a live session keeps the session and one profile (AUTH-EMAIL-011)", async () => {
    // A session-holding client (setupClient's TestUser is header-only and
    // can't call auth.updateUser) — sign in for real so the SDK holds the
    // session updateUser needs.
    const startEmail = `email-otp-live-${Date.now()}@example.test`;
    const password = "test-password-not-real-12345";
    const created = await service.auth.admin.createUser({
      email: startEmail,
      password,
      email_confirm: true,
    });
    const userId = created.data.user?.id as string;
    createdUserIds.push(userId);

    const authed = anonClient();
    const { error: signInErr } = await authed.auth.signInWithPassword({
      email: startEmail,
      password,
    });
    expect(signInErr).toBeNull();

    const newEmail = `email-otp-changed-${Date.now()}@example.test`;
    // Local config has auth.email.enable_confirmations = false, so this
    // applies immediately; on hosted it would require the 6-digit code
    // (verifyOtp type "email_change") — either way the session is untouched.
    const { error: updateErr } = await authed.auth.updateUser({
      email: newEmail,
    });
    expect(updateErr).toBeNull();

    // Still signed in — updateUser must not revoke the session.
    const { data: who, error: whoErr } = await authed.auth.getUser();
    expect(whoErr).toBeNull();
    expect(who.user?.id).toBe(userId);

    // Exactly one profile row, unchanged id — no duplicate account.
    const { data: rows } = await service
      .from("user_info")
      .select("id")
      .eq("id", userId);
    expect(rows).toHaveLength(1);

    await authed.auth.signOut().catch(() => {});
  });

  it("consume_rate_limit caps sends in a window (AUTH-EMAIL-007)", async () => {
    const key = `email-otp:send:test-${Date.now()}`;
    const call = () =>
      service.rpc("consume_rate_limit", {
        p_key: key,
        p_limit: 3,
        p_window_seconds: 900,
      });

    expect((await call()).data).toBe(true);
    expect((await call()).data).toBe(true);
    expect((await call()).data).toBe(true);
    expect((await call()).data).toBe(false);
  });

  describe("RLS still binds an email-authenticated user (AUTH-EMAIL-016)", () => {
    let victim: TestUser;
    let attacker: TestUser;

    beforeEach(async () => {
      victim = await createTestUser(service);
      attacker = await createTestUser(service);
      createdUserIds.push(victim.id, attacker.id);
    });

    it("cannot modify another user's profile row", async () => {
      const { data, error } = await attacker.client
        .from("user_info")
        .update({ full_name: "hijacked" })
        .eq("id", victim.id)
        .select("id");

      // RLS: either a hard error or simply zero rows affected — never a
      // successful write to someone else's row.
      if (!error) expect(data ?? []).toHaveLength(0);

      const { data: after } = await service
        .from("user_info")
        .select("full_name")
        .eq("id", victim.id)
        .single();
      expect(after?.full_name).not.toBe("hijacked");
    });
  });
});
