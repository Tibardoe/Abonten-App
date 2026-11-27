import { describe, expect, it, vi } from "vitest";

vi.mock("@abonten/services/supabase/serviceClient", () => ({
  getSupabaseServiceClient: () => ({}),
}));

import {
  OWNER_CONSENT_OTP_TTL_MS,
  PENDING_OTP_TTL_MS,
  pendingOtpTtlMs,
} from "./phoneOtpStore";

describe("pendingOtpTtlMs", () => {
  it("gives a business owner's consent code 30 minutes", () => {
    expect(pendingOtpTtlMs("fieldops-owner")).toBe(OWNER_CONSENT_OTP_TTL_MS);
    expect(OWNER_CONSENT_OTP_TTL_MS).toBe(30 * 60 * 1000);
  });

  it("keeps sign-in, phone and wallet codes at 5 minutes", () => {
    for (const purpose of ["sign-in", "phone-update", "wallet"] as const) {
      expect(pendingOtpTtlMs(purpose)).toBe(PENDING_OTP_TTL_MS);
    }
    expect(PENDING_OTP_TTL_MS).toBe(5 * 60 * 1000);
  });
});
