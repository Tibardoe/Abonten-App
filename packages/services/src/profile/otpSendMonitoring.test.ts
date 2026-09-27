import { describe, expect, it } from "vitest";
import { otpSendHealthy, redactPhoneDigits } from "./otpSendMonitoring";

describe("redactPhoneDigits", () => {
  it("masks phone numbers in any common shape", () => {
    expect(redactPhoneDigits("Invalid number +233241234567")).toBe(
      "Invalid number <number>",
    );
    expect(redactPhoneDigits("to 024 123 4567 failed")).toBe(
      "to <number> failed",
    );
    expect(redactPhoneDigits("msisdn 233-24-123-4567")).toBe("msisdn <number>");
  });

  it("keeps the short codes an operator needs", () => {
    expect(
      redactPhoneDigits(
        "Hubtel OTP send refused (HTTP 400, code 12): Payment required on account",
      ),
    ).toBe(
      "Hubtel OTP send refused (HTTP 400, code 12): Payment required on account",
    );
  });
});

describe("otpSendHealthy", () => {
  it("is healthy with no attempts or no failures", () => {
    expect(otpSendHealthy({ attempted: 0, failed: 0 })).toBe(true);
    expect(otpSendHealthy({ attempted: 5, failed: 0 })).toBe(true);
  });

  it("is healthy while some codes still go out", () => {
    expect(otpSendHealthy({ attempted: 4, failed: 3 })).toBe(true);
  });

  it("is down when every attempt in the window failed", () => {
    expect(otpSendHealthy({ attempted: 2, failed: 2 })).toBe(false);
    // A failure recorded without its log row (a provider that threw after
    // the window moved) still counts as nothing getting through.
    expect(otpSendHealthy({ attempted: 1, failed: 2 })).toBe(false);
  });
});
