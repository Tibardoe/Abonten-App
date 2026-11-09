import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit-level: no DB. Setting a password through the Admin API ends every
// session of the account, so phone sign-in must only do it when signing in
// with the account's password fails — never on an ordinary sign-in.

const updateUserById = vi.fn(async () => ({ data: {}, error: null }));

vi.mock("@abonten/services/supabase/serviceClient", () => ({
  getSupabaseServiceClient: () => ({ auth: { admin: { updateUserById } } }),
}));

import { phoneSignInPassword, signInVerifiedPhoneUser } from "./phoneAuthCore";

const USER = "4f9d3c2e-0000-4000-8000-000000000001";
const OTHER = "4f9d3c2e-0000-4000-8000-000000000002";
const wrongPassword = {
  error: { code: "invalid_credentials", message: "Invalid login credentials" },
};
const signedIn = { error: null, data: { session: { access_token: "a" } } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key-for-tests");
});

describe("phoneSignInPassword", () => {
  it("is the same every time for one account and differs between accounts", () => {
    expect(phoneSignInPassword(USER)).toBe(phoneSignInPassword(USER));
    expect(phoneSignInPassword(USER)).not.toBe(phoneSignInPassword(OTHER));
    expect(phoneSignInPassword(USER).length).toBeGreaterThanOrEqual(43);
  });

  it("changes with the server secret", () => {
    const before = phoneSignInPassword(USER);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "a-rotated-key");
    expect(phoneSignInPassword(USER)).not.toBe(before);
  });
});

describe("signInVerifiedPhoneUser", () => {
  it("signs in without touching the password when it already works", async () => {
    const attempt = vi.fn(async () => signedIn);
    const result = await signInVerifiedPhoneUser(USER, attempt);
    expect(result).toEqual({ ok: true, result: signedIn });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith(phoneSignInPassword(USER));
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("sets the password once when it does not work yet, then signs in", async () => {
    const attempt = vi
      .fn<
        (password: string) => Promise<typeof signedIn | typeof wrongPassword>
      >()
      .mockResolvedValueOnce(wrongPassword)
      .mockResolvedValueOnce(signedIn);
    const result = await signInVerifiedPhoneUser(USER, attempt);
    expect(result.ok).toBe(true);
    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(updateUserById).toHaveBeenCalledWith(USER, {
      password: phoneSignInPassword(USER),
    });
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("does not reset the password for any other failure", async () => {
    const attempt = vi.fn(async () => ({
      error: { code: "over_request_rate_limit", message: "Too many requests" },
    }));
    const result = await signInVerifiedPhoneUser(USER, attempt);
    expect(result).toEqual({ ok: false, message: "Too many requests" });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("reports a failed password update without signing in again", async () => {
    updateUserById.mockResolvedValueOnce({
      data: {},
      error: { message: "User not found" },
    } as never);
    const attempt = vi.fn(async () => wrongPassword);
    const result = await signInVerifiedPhoneUser(USER, attempt);
    expect(result).toEqual({ ok: false, message: "User not found" });
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
