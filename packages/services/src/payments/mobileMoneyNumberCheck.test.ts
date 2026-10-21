import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMarketOrDefault } from "../markets/marketConfig";
import {
  sendPhoneOtpCore,
  verifyPendingOtp,
} from "../profile/phoneOtpSendCore";
import {
  clearPendingOtp,
  getPendingOtp,
  registerVerifyAttempt,
} from "../profile/phoneOtpStore";
import { isAccountRestricted } from "../security/accountStatus";
import {
  confirmMobileMoneyNumber,
  requestMobileMoneyNumberCodeCore,
} from "./mobileMoneyNumberCheck";

// The account the service-role lookup returns: its phone and whether it is
// verified decide whether a wallet number needs a code.
let account: { phone: string | null; phone_confirmed_at: string | null } = {
  phone: null,
  phone_confirmed_at: null,
};

vi.mock("../supabase/serviceClient", () => ({
  getSupabaseServiceClient: () => ({
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: account }, error: null }),
      },
    },
  }),
}));

vi.mock("../profile/phoneOtpStore", () => ({
  getPendingOtp: vi.fn(),
  registerVerifyAttempt: vi.fn(),
  clearPendingOtp: vi.fn(),
}));

vi.mock("../profile/phoneOtpSendCore", () => ({
  sendPhoneOtpCore: vi.fn(),
  verifyPendingOtp: vi.fn(),
}));

vi.mock("../security/accountStatus", () => ({
  isAccountRestricted: vi.fn(async () => false),
  restrictedAccountMessage: () => "Your account is restricted.",
}));

const GHANA = {
  countryCode: "GH",
  name: "Ghana",
  dialCode: "+233",
  paymentMethods: [{ enabled: true, method: "mobile_money" }],
  payoutMethods: [{ enabled: true, method: "mobile_money" }],
};
const NO_MOMO = {
  countryCode: "XX",
  name: "Nowhere",
  dialCode: "+44",
  paymentMethods: [{ enabled: true, method: "card" }],
  payoutMethods: [{ enabled: true, method: "bank" }],
};

vi.mock("../markets/marketConfig", () => ({
  getMarketOrDefault: vi.fn(async () => GHANA),
}));

// The home-country read (user_info) of the caller's client.
const caller = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { country_code: "GH" } }),
      }),
    }),
  }),
} as unknown as SupabaseClient;

const PENDING = {
  provider: "hubtel",
  requestId: "r1",
  prefix: "",
  createdAt: Date.now(),
  attempts: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  account = { phone: null, phone_confirmed_at: null };
  vi.mocked(getPendingOtp).mockResolvedValue(PENDING as never);
  vi.mocked(registerVerifyAttempt).mockResolvedValue(true);
  vi.mocked(verifyPendingOtp).mockResolvedValue({ ok: true });
  vi.mocked(sendPhoneOtpCore).mockResolvedValue({
    status: 200,
    phoneE164: "+233241234567",
    codeLength: 6,
    provider: "hubtel",
  });
});

describe("confirmMobileMoneyNumber", () => {
  it("needs no code for the account's own verified phone", async () => {
    account = {
      phone: "233241234567",
      phone_confirmed_at: "2026-10-01T00:00:00Z",
    };
    const res = await confirmMobileMoneyNumber("u1", "+233241234567", null);
    expect(res).toEqual({ ok: true });
    expect(getPendingOtp).not.toHaveBeenCalled();
  });

  it("asks for a code when the account's phone is not verified", async () => {
    account = { phone: "233241234567", phone_confirmed_at: null };
    const res = await confirmMobileMoneyNumber("u1", "+233241234567", null);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.status).toBe(400);
  });

  it("asks for a code for any other number", async () => {
    account = {
      phone: "233200000000",
      phone_confirmed_at: "2026-10-01T00:00:00Z",
    };
    const res = await confirmMobileMoneyNumber("u1", "+233241234567", "");
    expect(res.ok).toBe(false);
    expect(verifyPendingOtp).not.toHaveBeenCalled();
  });

  it("refuses when no code was sent or it has expired", async () => {
    vi.mocked(getPendingOtp).mockResolvedValue(null);
    const res = await confirmMobileMoneyNumber("u1", "+233241234567", "123456");
    expect(res.ok === false && res.status).toBe(400);
    expect(registerVerifyAttempt).not.toHaveBeenCalled();
  });

  it("stops after the attempts run out", async () => {
    vi.mocked(registerVerifyAttempt).mockResolvedValue(false);
    const res = await confirmMobileMoneyNumber("u1", "+233241234567", "123456");
    expect(res.ok === false && res.status).toBe(429);
    expect(verifyPendingOtp).not.toHaveBeenCalled();
  });

  it("keeps the code waiting when it is wrong", async () => {
    vi.mocked(verifyPendingOtp).mockResolvedValue({
      ok: false,
      message: "That code is incorrect.",
    });
    const res = await confirmMobileMoneyNumber("u1", "+233241234567", "000000");
    expect(res).toEqual({
      ok: false,
      status: 400,
      message: "That code is incorrect.",
    });
    expect(clearPendingOtp).not.toHaveBeenCalled();
  });

  it("uses up a right code, under the wallet purpose only", async () => {
    const res = await confirmMobileMoneyNumber("u1", "+233241234567", "123456");
    expect(res).toEqual({ ok: true });
    expect(getPendingOtp).toHaveBeenCalledWith("wallet", "+233241234567");
    expect(clearPendingOtp).toHaveBeenCalledWith("wallet", "+233241234567");
  });
});

describe("requestMobileMoneyNumberCodeCore", () => {
  it("sends nothing for the account's own verified phone", async () => {
    account = {
      phone: "233241234567",
      phone_confirmed_at: "2026-10-01T00:00:00Z",
    };
    const res = await requestMobileMoneyNumberCodeCore(
      caller,
      "u1",
      { phone: "024 123 4567", use: "wallet" },
      null,
    );
    expect(res).toEqual({
      status: 200,
      data: { phoneE164: "+233241234567", needsCode: false, codeLength: 0 },
    });
    expect(sendPhoneOtpCore).not.toHaveBeenCalled();
  });

  it("texts a wallet code to any other number", async () => {
    const res = await requestMobileMoneyNumberCodeCore(
      caller,
      "u1",
      { phone: "0241234567", use: "wallet" },
      "1.2.3.4",
    );
    expect(res).toEqual({
      status: 200,
      data: { phoneE164: "+233241234567", needsCode: true, codeLength: 6 },
    });
    expect(sendPhoneOtpCore).toHaveBeenCalledWith({
      dialCode: "+233",
      rawPhone: "0241234567",
      purpose: "wallet",
      ipAddress: "1.2.3.4",
    });
  });

  it("passes on a refused send (cooldown, caps)", async () => {
    vi.mocked(sendPhoneOtpCore).mockResolvedValue({
      status: 429,
      message: "Please wait 60s",
    });
    const res = await requestMobileMoneyNumberCodeCore(
      caller,
      "u1",
      { phone: "0241234567", use: "wallet" },
      null,
    );
    expect(res).toEqual({ status: 429, message: "Please wait 60s" });
  });

  it("sends no text message for a restricted account", async () => {
    vi.mocked(isAccountRestricted).mockResolvedValueOnce(true);
    const res = await requestMobileMoneyNumberCodeCore(
      caller,
      "u1",
      { phone: "0241234567", use: "wallet" },
      null,
    );
    expect(res.status).toBe(403);
    expect(sendPhoneOtpCore).not.toHaveBeenCalled();
  });

  it("refuses a market without mobile money before sending", async () => {
    vi.mocked(getMarketOrDefault).mockResolvedValueOnce(NO_MOMO as never);
    const res = await requestMobileMoneyNumberCodeCore(
      caller,
      "u1",
      { phone: "07700900123", use: "payout", countryCode: "XX" },
      null,
    );
    expect(res.status).toBe(400);
    expect(sendPhoneOtpCore).not.toHaveBeenCalled();
  });

  it("checks a payout number in the market the account names", async () => {
    await requestMobileMoneyNumberCodeCore(
      caller,
      "u1",
      { phone: "0241234567", use: "payout", countryCode: "GH" },
      null,
    );
    expect(getMarketOrDefault).toHaveBeenCalledWith("GH");
  });

  it("refuses a number that cannot be a phone", async () => {
    const res = await requestMobileMoneyNumberCodeCore(
      caller,
      "u1",
      { phone: "12", use: "wallet" },
      null,
    );
    expect(res.status).toBe(400);
    expect(sendPhoneOtpCore).not.toHaveBeenCalled();
  });
});
