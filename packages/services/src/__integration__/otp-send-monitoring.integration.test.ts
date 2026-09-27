import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// A code the provider refuses must be visible to monitoring. The `hubtel`
// probe only checks that Hubtel answers; an unpaid account answers and
// sends nothing (seen 2026-09-20). Here Hubtel's send endpoint is stubbed
// to refuse, the real send path runs, and the failure must land in
// app_error_event (without the phone number) and in the `otp` health read.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { invalidateMarketCache } from "../markets/marketConfig";
import {
  OTP_SEND_FAILED_ERROR_TYPE,
  readOtpSendHealth,
} from "../profile/otpSendMonitoring";
import { sendPhoneOtpCore } from "../profile/phoneOtpSendCore";
import { getServiceClient } from "./setupClient";

const HUBTEL_ENV = ["HUBTEL_API_CLIENT_ID", "HUBTEL_API_CLIENT_SECRET"];
// A Ghana number nobody else in the suite uses.
const LOCAL_PART = `24${String(Date.now()).slice(-7)}`;
const E164 = `+233${LOCAL_PART}`;

describe("OTP send monitoring", () => {
  let service: SupabaseClient<Database>;
  const savedEnv: Record<string, string | undefined> = {};
  const startedAt = new Date().toISOString();

  beforeAll(() => {
    service = getServiceClient();
    for (const name of HUBTEL_ENV) {
      savedEnv[name] = process.env[name];
      process.env[name] = `test-${name.toLowerCase()}`;
    }
    invalidateMarketCache();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await service.from("phone_otp_send_log").delete().eq("phone_e164", E164);
    await service.from("phone_otp_state").delete().eq("phone_e164", E164);
    await service
      .from("app_error_event")
      .delete()
      .eq("error_type", OTP_SEND_FAILED_ERROR_TYPE)
      .gte("occurred_at", startedAt);
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    invalidateMarketCache();
  });

  it("records a refused send without the number and counts it as failed", async () => {
    const before = await readOtpSendHealth(service as never);

    const real = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (url.startsWith("https://api-otp.hubtel.com/")) {
          return new Response(
            JSON.stringify({
              code: "4101",
              message: `Payment required on account for ${E164}`,
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }
        return real(input, init);
      },
    );

    const result = await sendPhoneOtpCore({
      dialCode: "+233",
      rawPhone: LOCAL_PART,
      purpose: "sign-in",
      ipAddress: null,
    });
    vi.unstubAllGlobals();

    // The person is told it failed, not why.
    expect(result.status).toBe(500);
    if (result.status !== 200) {
      expect(result.message).not.toContain("Payment");
    }

    const after = await readOtpSendHealth(service as never);
    expect(after.attempted - before.attempted).toBe(1);
    expect(after.failed - before.failed).toBe(1);
    expect(after.lastFailure?.message).toContain("Payment required on account");
    expect(after.lastFailure?.message).toContain("HTTP 400");
    expect(after.lastFailure?.message).not.toContain(LOCAL_PART);

    const { data: events } = await service
      .from("app_error_event")
      .select("platform, route, context, user_id")
      .eq("error_type", OTP_SEND_FAILED_ERROR_TYPE)
      .gte("occurred_at", startedAt);
    expect(events).toHaveLength(1);
    expect(events?.[0]).toMatchObject({
      platform: "api",
      route: "otp-send",
      user_id: null,
      context: { provider: "hubtel", country: "GH", reason: "provider_error" },
    });
  });
});
