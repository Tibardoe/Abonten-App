import { describe, expect, it } from "vitest";
import { eventCodePrefix, generateEventCode } from "./eventCodeGenerator";

const FORMAT = /^[A-Z0-9]{1,2}[2-9A-HJKMNP-Z]{6}$/;

/** A random source that replays `values` (then zeros). */
function replay(values: number[]) {
  let i = 0;
  return (bytes: Uint8Array) => {
    for (let j = 0; j < bytes.length; j++) bytes[j] = values[i++] ?? 0;
    return bytes;
  };
}

describe("eventCodePrefix", () => {
  it("takes the first letter of the first two words", () => {
    expect(eventCodePrefix("Tech Conference 2026")).toBe("TC");
    expect(eventCodePrefix("afro night")).toBe("AN");
    expect(eventCodePrefix("Brunch")).toBe("B");
    expect(eventCodePrefix("2026 Fest")).toBe("2F");
  });

  it("survives spacing and punctuation that used to crash it", () => {
    // Two spaces between words made the old generator read ""[0].
    expect(eventCodePrefix("Afro  Night")).toBe("AN");
    expect(eventCodePrefix("  — Jazz, Wine & Poetry")).toBe("JW");
  });

  it("drops accents and falls back for titles with no Latin letters", () => {
    expect(eventCodePrefix("Éclat Été")).toBe("EE");
    expect(eventCodePrefix("حفلة موسيقية")).toBe("EV");
    expect(eventCodePrefix("")).toBe("EV");
  });
});

describe("generateEventCode", () => {
  it("is the prefix and six characters that survive a link's lower/upper round trip", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateEventCode("Tech Conference");
      expect(code).toMatch(FORMAT);
      expect(code.startsWith("TC")).toBe(true);
      expect(code.toLowerCase().toUpperCase()).toBe(code);
    }
  });

  it("never uses the look-alikes 0, O, 1, I or L", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateEventCode("Zz Zz").slice(2)).not.toMatch(/[01OIL]/);
    }
  });

  it("maps random bytes evenly, redrawing the biased tail", () => {
    // 31 symbols: bytes 0..247 map (byte % 31); 248..255 are redrawn.
    expect(
      generateEventCode("Tech Conference", replay([0, 1, 30, 31, 62, 247])),
    ).toBe("TC23Z22Z");
    expect(
      generateEventCode(
        "Tech Conference",
        replay([255, 248, 0, 1, 2, 3, 4, 5]),
      ),
    ).toBe("TC234567");
  });
});
