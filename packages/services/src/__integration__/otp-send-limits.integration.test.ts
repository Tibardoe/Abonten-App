import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Production gate (2026-09-25): text-message codes cost money and can be
// aimed at someone else's phone. The per-number cooldown and the per-address
// cap used to be read-then-send, so simultaneous requests all passed the
// check before any of them was recorded. The provider is faked; every call
// that reaches it counts as one text message.
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
import { sendPhoneOtpCore } from "../profile/phoneOtpSendCore";
import { recordOtpSent, registerVerifyAttempt } from "../profile/phoneOtpStore";
import { getServiceClient } from "./setupClient";

// A Ghana number no real person has (the 0 after the network code).
const NUMBER = "0201234567";
const E164 = "+233201234567";

describe("text-message code limits", () => {
  let service: SupabaseClient<Database>;
  const saved: Record<string, string | undefined> = {};
  const send = vi.spyOn(hubtelOtpProvider, "send");

  async function clean() {
    await service.from("phone_otp_send_log").delete().eq("phone_e164", E164);
    await service.from("phone_otp_state").delete().eq("phone_e164", E164);
    await service
      .from("phone_otp_send_log")
      .delete()
      .like("ip_address", "198.51.100.%");
  }

  beforeAll(async () => {
    service = getServiceClient();
    for (const name of ["HUBTEL_API_CLIENT_ID", "HUBTEL_API_CLIENT_SECRET"]) {
      saved[name] = process.env[name];
      process.env[name] = `test-${name.toLowerCase()}`;
    }
    invalidateMarketCache();
    send.mockImplementation(async () => ({
      ok: true,
      requestId: crypto.randomUUID(),
      prefix: "ABCD",
    }));
    await clean();
  });

  afterEach(async () => {
    send.mockClear();
    await clean();
  });

  afterAll(async () => {
    send.mockRestore();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("20 simultaneous requests for one number send one code", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        sendPhoneOtpCore({
          dialCode: "+233",
          rawPhone: NUMBER,
          purpose: "sign-in",
          ipAddress: `198.51.100.${i + 1}`,
        }),
      ),
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 429)).toHaveLength(19);
  });

  it("the cooldown covers every purpose, not each one separately", async () => {
    const first = await sendPhoneOtpCore({
      dialCode: "+233",
      rawPhone: NUMBER,
      purpose: "sign-in",
      ipAddress: "198.51.100.50",
    });
    const second = await sendPhoneOtpCore({
      dialCode: "+233",
      rawPhone: NUMBER,
      purpose: "phone-update",
      ipAddress: "198.51.100.51",
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("caps one number per hour even when the cooldown has passed", async () => {
    // Five earlier codes this hour, the last one over a minute ago.
    await service.from("phone_otp_send_log").insert(
      Array.from({ length: 5 }, (_, i) => ({
        phone_e164: E164,
        ip_address: `198.51.100.${60 + i}`,
        created_at: new Date(Date.now() - (50 - i * 10) * 60_000).toISOString(),
      })),
    );
    const result = await sendPhoneOtpCore({
      dialCode: "+233",
      rawPhone: NUMBER,
      purpose: "sign-in",
      ipAddress: "198.51.100.70",
    });
    expect(result.status).toBe(429);
    expect(send).not.toHaveBeenCalled();
  });

  it("caps one address across simultaneous requests for different numbers", async () => {
    const ip = "198.51.100.99";
    const numbers = Array.from(
      { length: 20 },
      (_, i) => `02012345${String(i + 10).padStart(2, "0")}`,
    );
    const results = await Promise.all(
      numbers.map((n) =>
        sendPhoneOtpCore({
          dialCode: "+233",
          rawPhone: n,
          purpose: "sign-in",
          ipAddress: ip,
        }),
      ),
    );
    // (clean() removes their send-log rows by the test address.)
    await service
      .from("phone_otp_state")
      .delete()
      .like("phone_e164", "+2332012345%");
    expect(results.filter((r) => r.status === 200)).toHaveLength(10);
    expect(send).toHaveBeenCalledTimes(10);
  });

  it("20 simultaneous guesses at one code use at most the 5 attempts", async () => {
    await recordOtpSent("sign-in", E164, "req-guess", "ABCD", "hubtel");
    const allowed = await Promise.all(
      Array.from({ length: 20 }, () => registerVerifyAttempt("sign-in", E164)),
    );
    expect(allowed.filter(Boolean)).toHaveLength(5);
    // The spent code is gone: the next guess needs a fresh code.
    expect(await registerVerifyAttempt("sign-in", E164)).toBe(false);
  });
});
