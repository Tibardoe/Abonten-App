import { describe, expect, it } from "vitest";
import {
  countryForDialCode,
  dialCodeFor,
  formatPhoneNational,
  isValidPhone,
  maskPhoneNumber,
  parsePhone,
  parsePhoneWithDialCode,
  phoneCountry,
} from "./phone";

describe("parsePhoneWithDialCode", () => {
  it("accepts every shape a Ghanaian types", () => {
    for (const raw of [
      "0241234567",
      "241234567",
      "024 123 4567",
      "+233241234567",
      "233241234567",
    ]) {
      const r = parsePhoneWithDialCode("+233", raw);
      expect(r.ok, raw).toBe(true);
      if (r.ok) {
        expect(r.e164).toBe("+233241234567");
        expect(r.country).toBe("GH");
      }
    }
  });

  it("parses other markets with their own rules", () => {
    const ng = parsePhoneWithDialCode("+234", "08012345678");
    expect(ng.ok && ng.e164).toBe("+2348012345678");
    const ke = parsePhoneWithDialCode("+254", "0712345678");
    expect(ke.ok && ke.e164).toBe("+254712345678");
    const gb = parsePhoneWithDialCode("+44", "07400 123456");
    expect(gb.ok && gb.e164).toBe("+447400123456");
    const us = parsePhoneWithDialCode("+1", "(415) 555-2671");
    expect(us.ok && us.e164).toBe("+14155552671");
    const fr = parsePhoneWithDialCode("+33", "06 12 34 56 78");
    expect(fr.ok && fr.e164).toBe("+33612345678");
  });

  it("lets a pasted international number override the picker", () => {
    const r = parsePhoneWithDialCode("+233", "+44 7400 123456");
    expect(r.ok && r.e164).toBe("+447400123456");
    expect(r.ok && r.country).toBe("GB");
  });

  it("rejects what a national plan rejects", () => {
    expect(parsePhoneWithDialCode("+233", "").ok).toBe(false);
    expect(parsePhoneWithDialCode("+233", "12").ok).toBe(false);
    expect(parsePhoneWithDialCode("+233", "02412345678901").ok).toBe(false);
    expect(parsePhoneWithDialCode("", "0241234567").ok).toBe(false);
    const short = parsePhoneWithDialCode("+233", "024");
    expect(!short.ok && short.error).toBe("too_short");
  });
});

describe("formatting and lookups", () => {
  it("formats nationally per country", () => {
    expect(formatPhoneNational("+233241234567")).toBe("024 123 4567");
    expect(formatPhoneNational("+447400123456")).toBe("07400 123456");
    expect(formatPhoneNational("+2348012345678")).toBe("0801 234 5678");
  });

  it("resolves dial codes and countries", () => {
    expect(dialCodeFor("GH")).toBe("+233");
    expect(dialCodeFor("ng")).toBe("+234");
    expect(dialCodeFor("XX")).toBeNull();
    expect(countryForDialCode("+233")).toBe("GH");
    expect(countryForDialCode("+44")).toBe("GB");
    expect(countryForDialCode("+1")).toBe("US");
    expect(countryForDialCode("+254")).toBe("KE");
    expect(phoneCountry("+447400123456")).toBe("GB");
    expect(isValidPhone("+233241234567")).toBe(true);
    expect(isValidPhone("+2331")).toBe(false);
  });

  it("parses bare E.164 without a default country", () => {
    const r = parsePhone("+233241234567");
    expect(r.ok && r.dialCode).toBe("+233");
    expect(parsePhone("0241234567").ok).toBe(false);
  });

  it("masks for the OTP screen", () => {
    expect(maskPhoneNumber("+233241234567")).toBe("+233241****67");
    expect(maskPhoneNumber("+12")).toBe("+12");
  });
});
