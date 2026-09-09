import { EMAIL_OTP_MESSAGES } from "@abonten/core/emailOtp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestEmailOtpCore, verifyEmailOtpCore } from "./emailAuthCore";

// Unit-level: no DB. The rate-limit primitive and the Supabase Auth calls
// are stubbed so we can assert this module's own logic — validation, the
// enumeration-safe result mapping, and that a rejected pre-check never
// reaches Supabase (AUTH-EMAIL-003/004/007/026).

vi.mock("@abonten/services/security/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => true),
}));

import { checkRateLimit } from "@abonten/services/security/rateLimit";

const mockedCheckRateLimit = vi.mocked(checkRateLimit);

function fakeClient(overrides: {
  signInWithOtp?: ReturnType<typeof vi.fn>;
  verifyOtp?: ReturnType<typeof vi.fn>;
}): SupabaseClient {
  return {
    auth: {
      signInWithOtp:
        overrides.signInWithOtp ??
        vi.fn(async () => ({ data: {}, error: null })),
      verifyOtp: overrides.verifyOtp ?? vi.fn(),
    },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedCheckRateLimit.mockResolvedValue(true);
});

describe("requestEmailOtpCore", () => {
  it("rejects an invalid email before any rate-limit or Supabase call (AUTH-EMAIL-003)", async () => {
    const signInWithOtp = vi.fn();
    const result = await requestEmailOtpCore(fakeClient({ signInWithOtp }), {
      email: "not-an-email",
      ip: "1.2.3.4",
    });

    expect(result).toEqual({
      status: 400,
      message: EMAIL_OTP_MESSAGES.invalidEmail,
    });
    expect(mockedCheckRateLimit).not.toHaveBeenCalled();
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("returns 429 without sending when the per-email cap is hit (AUTH-EMAIL-007)", async () => {
    mockedCheckRateLimit.mockResolvedValueOnce(false);
    const signInWithOtp = vi.fn();

    const result = await requestEmailOtpCore(fakeClient({ signInWithOtp }), {
      email: "ben@example.com",
      ip: "1.2.3.4",
    });

    expect(result.status).toBe(429);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("normalizes the email and asks Supabase to create the user if new", async () => {
    const signInWithOtp = vi.fn(async () => ({ data: {}, error: null }));

    const result = await requestEmailOtpCore(fakeClient({ signInWithOtp }), {
      email: "  BEN@Example.COM ",
      ip: null,
    });

    expect(result).toEqual({ status: 200 });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "ben@example.com",
      options: { shouldCreateUser: true },
    });
  });

  it("maps a Supabase 429 to a slow-down, not a failure", async () => {
    const signInWithOtp = vi.fn(async () => ({
      data: {},
      error: { status: 429, message: "rate limited" },
    }));

    const result = await requestEmailOtpCore(fakeClient({ signInWithOtp }), {
      email: "ben@example.com",
      ip: null,
    });

    expect(result.status).toBe(429);
  });

  it("never surfaces raw provider text on other errors (enumeration guard, AUTH-EMAIL-026)", async () => {
    const signInWithOtp = vi.fn(async () => ({
      data: {},
      error: { status: 500, message: "Signups not allowed for otp" },
    }));

    const result = await requestEmailOtpCore(fakeClient({ signInWithOtp }), {
      email: "ben@example.com",
      ip: null,
    });

    expect(result).toEqual({
      status: 500,
      message: EMAIL_OTP_MESSAGES.generic,
    });
  });
});

describe("verifyEmailOtpCore", () => {
  it("rejects a non-6-digit token before calling Supabase (AUTH-EMAIL-004)", async () => {
    const verifyOtp = vi.fn();
    const result = await verifyEmailOtpCore(fakeClient({ verifyOtp }), {
      email: "ben@example.com",
      token: "12ab",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      message: EMAIL_OTP_MESSAGES.invalidFormat,
    });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("returns the user id on success", async () => {
    const verifyOtp = vi.fn(async () => ({
      data: { user: { id: "user-123" }, session: {} },
      error: null,
    }));

    const result = await verifyEmailOtpCore(fakeClient({ verifyOtp }), {
      email: "ben@example.com",
      token: "123456",
    });

    expect(result).toEqual({ ok: true, userId: "user-123" });
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "ben@example.com",
      token: "123456",
      type: "email",
    });
  });

  // Both of these assert against the payload Supabase actually returns,
  // captured from the live project on 2026-09-09:
  //   403 {"error_code":"otp_expired","msg":"Token has expired or is invalid"}
  // It is byte-identical for a wrong code and an expired one — GoTrue will
  // not act as an oracle for either — so the app must say the same thing in
  // both cases. An earlier revision branched on /expired/i and asserted the
  // "wrong code" case with an invented message ("otp_disabled / invalid")
  // that GoTrue never sends, which is why it passed while every real
  // mistyped code was reported to the user as expired (AUTH-EMAIL-005).
  const realGoTrueRejection = {
    status: 403,
    message: "Token has expired or is invalid",
  };

  it("maps a genuinely expired code to the shared message (AUTH-EMAIL-005)", async () => {
    const verifyOtp = vi.fn(async () => ({
      data: { user: null },
      error: realGoTrueRejection,
    }));

    const result = await verifyEmailOtpCore(fakeClient({ verifyOtp }), {
      email: "ben@example.com",
      token: "123456",
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      message: EMAIL_OTP_MESSAGES.invalidOrExpired,
    });
  });

  it("maps a merely mistyped code to that same message, not 'expired'", async () => {
    const verifyOtp = vi.fn(async () => ({
      data: { user: null },
      error: realGoTrueRejection,
    }));

    const result = await verifyEmailOtpCore(fakeClient({ verifyOtp }), {
      email: "ben@example.com",
      token: "000000",
    });

    expect(result.ok).toBe(false);
    expect(result).toEqual({
      ok: false,
      status: 401,
      message: EMAIL_OTP_MESSAGES.invalidOrExpired,
    });
    // The old copy blamed expiry outright and told the user to request a new
    // code, which burns one of their three sends per 15 minutes for a typo.
    // The message must still offer "incorrect" as the likelier explanation.
    expect(result).not.toMatchObject({
      message: "That code has expired. Request a new one.",
    });
    expect(EMAIL_OTP_MESSAGES.invalidOrExpired).toMatch(/incorrect/i);
  });
});
