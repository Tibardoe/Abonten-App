import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// App store reviewers sign in with one configured number and a fixed code
// (appReviewOtpProvider). Nothing is texted; only sign-in routes there — a
// phone change or a Field Ops owner's consent for the same number still goes
// to the market's provider; and with the settings removed the number is an
// ordinary one again.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { invalidateMarketCache } from "../markets/marketConfig";
import { hubtelOtpProvider } from "../profile/otpProviders/hubtelOtpProvider";
import { routeOtpForPhone } from "../profile/otpProviders/otpRouter";
import { verifyPhoneOtpAndResolveUser } from "../profile/phoneAuthCore";
import { sendPhoneOtpCore } from "../profile/phoneOtpSendCore";
import { getServiceClient } from "./setupClient";

// A Ghana number no real person has (the 0 after the network code).
const NUMBER = "0201234568";
const E164 = "+233201234568";
const CODE = "482915";
const ENV = [
  "APP_REVIEW_PHONE_E164",
  "APP_REVIEW_OTP_CODE",
  "HUBTEL_API_CLIENT_ID",
  "HUBTEL_API_CLIENT_SECRET",
];

// Assigning undefined would store the string "undefined" in process.env.
function unsetEnv(name: string) {
  delete process.env[name];
}

describe("App Review sign-in", () => {
  let service: SupabaseClient<Database>;
  const saved: Record<string, string | undefined> = {};
  const hubtelSend = vi.spyOn(hubtelOtpProvider, "send");
  const createdUsers: string[] = [];

  async function clean() {
    await service.from("phone_otp_send_log").delete().eq("phone_e164", E164);
    await service.from("phone_otp_state").delete().eq("phone_e164", E164);
  }

  function enableReview() {
    process.env.APP_REVIEW_PHONE_E164 = E164;
    process.env.APP_REVIEW_OTP_CODE = CODE;
  }

  function signIn() {
    return sendPhoneOtpCore({
      dialCode: "+233",
      rawPhone: NUMBER,
      purpose: "sign-in",
      ipAddress: "198.51.100.77",
    });
  }

  beforeAll(async () => {
    service = getServiceClient();
    for (const name of ENV) saved[name] = process.env[name];
    // Hubtel "configured", so choosing App Review is a real routing decision.
    process.env.HUBTEL_API_CLIENT_ID = "test-hubtel-id";
    process.env.HUBTEL_API_CLIENT_SECRET = "test-hubtel-secret";
    hubtelSend.mockImplementation(async () => ({
      ok: true,
      requestId: crypto.randomUUID(),
      prefix: "ABCD",
    }));
    invalidateMarketCache();
    await clean();
  });

  afterEach(async () => {
    hubtelSend.mockClear();
    unsetEnv("APP_REVIEW_PHONE_E164");
    unsetEnv("APP_REVIEW_OTP_CODE");
    await clean();
  });

  afterAll(async () => {
    hubtelSend.mockRestore();
    for (const id of createdUsers) await service.auth.admin.deleteUser(id);
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("texts nothing and signs in with the fixed code only", async () => {
    enableReview();
    const sent = await signIn();
    expect(sent).toMatchObject({
      status: 200,
      phoneE164: E164,
      codeLength: 6,
      provider: "app_review",
    });
    expect(hubtelSend).not.toHaveBeenCalled();

    const { data: pending } = await service
      .from("phone_otp_state")
      .select("provider")
      .eq("purpose", "sign-in")
      .eq("phone_e164", E164)
      .single();
    expect(pending?.provider).toBe("app_review");

    const wrong = await verifyPhoneOtpAndResolveUser(E164, "000000");
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.status).toBe(401);

    const right = await verifyPhoneOtpAndResolveUser(E164, CODE);
    expect(right.ok).toBe(true);
    if (right.ok) {
      createdUsers.push(right.userId);
      expect(right.isNewUser).toBe(true);
    }

    // The code was consumed; replaying it needs a fresh request.
    const replay = await verifyPhoneOtpAndResolveUser(E164, CODE);
    expect(replay.ok).toBe(false);
  });

  it("keeps the usual guess limit", async () => {
    enableReview();
    await signIn();
    for (let i = 0; i < 5; i++) {
      const guess = await verifyPhoneOtpAndResolveUser(E164, `00000${i}`);
      expect(guess.ok).toBe(false);
    }
    const afterLimit = await verifyPhoneOtpAndResolveUser(E164, CODE);
    expect(afterLimit.ok).toBe(false);
  });

  it("never serves a phone change or a Field Ops owner's consent", async () => {
    enableReview();
    const change = await routeOtpForPhone(E164, { purpose: "phone-update" });
    expect(change.ok && change.provider.code).toBe("hubtel");
    // ownerOtpCore routes without a purpose.
    const consent = await routeOtpForPhone(E164);
    expect(consent.ok && consent.provider.code).toBe("hubtel");
  });

  it("is an ordinary number once the settings are removed", async () => {
    const route = await routeOtpForPhone(E164, { purpose: "sign-in" });
    expect(route.ok && route.provider.code).toBe("hubtel");
  });

  it("drops a pending review code when the settings are removed", async () => {
    enableReview();
    await signIn();
    unsetEnv("APP_REVIEW_OTP_CODE");
    const result = await verifyPhoneOtpAndResolveUser(E164, CODE);
    expect(result.ok).toBe(false);
  });
});
