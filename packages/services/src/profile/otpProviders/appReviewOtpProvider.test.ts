import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appReviewOtpProvider, isAppReviewPhone } from "./appReviewOtpProvider";

const PHONE = "+233201234568";
const CODE = "482915";
const ENV = ["APP_REVIEW_PHONE_E164", "APP_REVIEW_OTP_CODE"] as const;

// Assigning undefined would store the string "undefined" in process.env.
function unsetEnv(name: string) {
  delete process.env[name];
}

describe("appReviewOtpProvider", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of ENV) saved[name] = process.env[name];
    process.env.APP_REVIEW_PHONE_E164 = PHONE;
    process.env.APP_REVIEW_OTP_CODE = CODE;
  });

  afterEach(() => {
    for (const name of ENV) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it("matches only the configured number", () => {
    expect(isAppReviewPhone(PHONE)).toBe(true);
    expect(isAppReviewPhone("+233201234567")).toBe(false);
  });

  it("is off when either setting is missing", () => {
    unsetEnv("APP_REVIEW_OTP_CODE");
    expect(appReviewOtpProvider.isConfigured()).toBe(false);
    expect(isAppReviewPhone(PHONE)).toBe(false);
  });

  it("is off when the code is not six digits or the number is not E.164", () => {
    for (const code of ["48291", "4829150", "48291a", ""]) {
      process.env.APP_REVIEW_OTP_CODE = code;
      expect(isAppReviewPhone(PHONE)).toBe(false);
    }
    process.env.APP_REVIEW_OTP_CODE = CODE;
    process.env.APP_REVIEW_PHONE_E164 = "0201234568";
    expect(isAppReviewPhone("0201234568")).toBe(false);
  });

  it("asks for a six-digit code", () => {
    expect(appReviewOtpProvider.codeLength()).toBe(6);
  });

  it("'sends' without texting, and only for the review number", async () => {
    const sent = await appReviewOtpProvider.send(PHONE, "GH");
    expect(sent.ok).toBe(true);
    const other = await appReviewOtpProvider.send("+233201234567", "GH");
    expect(other.ok).toBe(false);
  });

  it("accepts the configured code and nothing else", async () => {
    expect(await appReviewOtpProvider.verify("r", "review", CODE)).toEqual({
      ok: true,
    });
    for (const guess of ["482916", "000000", "48291", ""]) {
      const result = await appReviewOtpProvider.verify("r", "review", guess);
      expect(result.ok).toBe(false);
    }
  });

  it("refuses the code once the settings are removed", async () => {
    unsetEnv("APP_REVIEW_PHONE_E164");
    const result = await appReviewOtpProvider.verify("r", "review", CODE);
    expect(result.ok).toBe(false);
  });
});
