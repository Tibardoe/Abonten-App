import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Which numbers get a text-message code (otpRouter): never a market that is
// still being set up, and never past the country's hourly ceiling — the
// circuit breaker against SMS pumping. Nothing is actually sent: routing is
// decided before any provider call.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invalidateMarketCache } from "../markets/marketConfig";
import {
  OTHER_MARKET_SENDS_PER_HOUR,
  routeOtpForPhone,
} from "../profile/otpProviders/otpRouter";
import { getServiceClient } from "./setupClient";

const NG_NUMBER = "+2348031234567";
const TWILIO_ENV = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_VERIFY_SERVICE_SID",
];

describe("OTP routing", () => {
  let service: SupabaseClient<Database>;
  let originalStatus: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    service = getServiceClient();
    const { data } = await service
      .from("market")
      .select("status")
      .eq("country_code", "NG")
      .single();
    originalStatus = data?.status as string;
    for (const name of TWILIO_ENV) {
      savedEnv[name] = process.env[name];
      process.env[name] = `test-${name.toLowerCase()}`;
    }
  });

  afterAll(async () => {
    await service
      .from("market")
      .update({ status: originalStatus })
      .eq("country_code", "NG");
    await service
      .from("phone_otp_send_log")
      .delete()
      .like("phone_e164", "+234%");
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    invalidateMarketCache();
  });

  const setStatus = async (status: string) => {
    await service.from("market").update({ status }).eq("country_code", "NG");
    invalidateMarketCache();
  };

  it("sends no codes for a market that is still being prepared", async () => {
    await setStatus("preparing");
    const route = await routeOtpForPhone(NG_NUMBER);
    expect(route.ok).toBe(false);
  });

  it("routes a ready market's number to its provider", async () => {
    await setStatus("ready");
    const route = await routeOtpForPhone(NG_NUMBER);
    expect(route.ok).toBe(true);
  });

  it("stops sending once the country's hourly ceiling is reached", async () => {
    await setStatus("ready");
    const rows = Array.from(
      { length: OTHER_MARKET_SENDS_PER_HOUR },
      (_, i) => ({
        phone_e164: `+23480${String(10_000_000 + i)}`,
        ip_address: `198.51.100.${i % 250}`,
      }),
    );
    const { error } = await service.from("phone_otp_send_log").insert(rows);
    expect(error).toBeNull();
    const route = await routeOtpForPhone(NG_NUMBER);
    expect(route.ok).toBe(false);
    if (!route.ok) expect(route.reason).toBe("busy");
  });

  it("serves a number in a shared calling code from the code's main market", async () => {
    const { data: gb } = await service
      .from("market")
      .select("status")
      .eq("country_code", "GB")
      .single();
    await service
      .from("market")
      .update({ status: "ready" })
      .eq("country_code", "GB");
    invalidateMarketCache();
    try {
      // libphonenumber files +44 7911 … under Guernsey (GG), which has no
      // market of its own; the UK market serves it.
      const route = await routeOtpForPhone("+447911123456");
      expect(route.ok).toBe(true);
      if (route.ok) expect(route.countryCode).toBe("GB");
    } finally {
      await service
        .from("market")
        .update({ status: gb?.status as string })
        .eq("country_code", "GB");
      invalidateMarketCache();
    }
  });
});
