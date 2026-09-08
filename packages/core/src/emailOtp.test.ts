import { describe, expect, it } from "vitest";
import {
  EMAIL_OTP_CODE_LENGTH,
  isLikelyEmail,
  maskEmail,
  normalizeEmail,
} from "./emailOtp";

describe("emailOtp helpers", () => {
  it("email OTP is 6 digits (Supabase), distinct from Hubtel's 4", () => {
    expect(EMAIL_OTP_CODE_LENGTH).toBe(6);
  });

  describe("isLikelyEmail", () => {
    it.each([
      "ben@example.com",
      "a.b+tag@sub.domain.io",
      "  spaced@example.com  ",
    ])("accepts %s", (value) => {
      expect(isLikelyEmail(value)).toBe(true);
    });

    it.each(["", "ben", "ben@", "@example.com", "ben @example.com", "ben@ex"])(
      "rejects %s",
      (value) => {
        expect(isLikelyEmail(value)).toBe(false);
      },
    );

    it("rejects an over-long address", () => {
      expect(isLikelyEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
    });
  });

  describe("normalizeEmail", () => {
    it("lowercases and trims", () => {
      expect(normalizeEmail("  Ben@Example.COM ")).toBe("ben@example.com");
    });
  });

  describe("maskEmail", () => {
    it("keeps the first local char and the whole domain", () => {
      expect(maskEmail("ben@example.com")).toBe("b••@example.com");
    });

    it("still masks a single-char local part", () => {
      expect(maskEmail("j@x.io")).toBe("j•@x.io");
    });

    it("returns the input unchanged when there is no @", () => {
      expect(maskEmail("not-an-email")).toBe("not-an-email");
    });

    it("never leaks more than the first character of the local part", () => {
      const masked = maskEmail("verylonglocalpart@example.com");
      expect(masked.startsWith("v•")).toBe(true);
      expect(masked).not.toContain("verylonglocalpart");
    });
  });
});
