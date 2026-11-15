import { describe, expect, it } from "vitest";
import {
  TICKET_CODE_ALPHABET,
  formatTicketCodeForReading,
  isLegacyTicketCode,
  isValidNewTicketCode,
  newTicketCode,
  normalizeTypedTicketCode,
  ticketCodeCheckChar,
} from "./ticketCode";

describe("ticket codes", () => {
  it("makes codes in the new format that pass their own check", () => {
    for (let i = 0; i < 500; i++) {
      const code = newTicketCode();
      expect(code).toMatch(/^TKT-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{12}$/);
      expect(isValidNewTicketCode(code)).toBe(true);
    }
  });

  it("never uses look-alike characters", () => {
    expect(TICKET_CODE_ALPHABET).not.toMatch(/[01OIL]/);
    expect(TICKET_CODE_ALPHABET).toHaveLength(31);
  });

  it("skips the bytes that would favour some characters (no modulo bias)", () => {
    // 248..255 are thrown away; every other byte b becomes alphabet[b % 31],
    // so each character has exactly 8 bytes that produce it.
    const feed = [255, 248, 0, 31, 62, 247, 249, 1, 32, 63, 94, 125, 156, 187];
    const code = newTicketCode((length) =>
      Uint8Array.from({ length }, (_, i) => feed[i] ?? 0),
    );
    const a = TICKET_CODE_ALPHABET;
    expect(code.slice(4, 15)).toBe(
      `${a[0]}${a[0]}${a[0]}${a[30]}${a[1]}${a[1]}${a[1]}${a[1]}${a[1]}${a[1]}${a[1]}`,
    );
  });

  it("catches every single wrong character", () => {
    const code = newTicketCode();
    const body = code.slice(4);
    for (let i = 0; i < body.length; i++) {
      for (const ch of TICKET_CODE_ALPHABET) {
        if (ch === body.charAt(i)) continue;
        const typo = `TKT-${body.slice(0, i)}${ch}${body.slice(i + 1)}`;
        expect(isValidNewTicketCode(typo)).toBe(false);
      }
    }
  });

  it("catches every swap of two neighbours", () => {
    for (let n = 0; n < 200; n++) {
      const body = newTicketCode().slice(4);
      for (let i = 0; i < body.length - 1; i++) {
        if (body.charAt(i) === body.charAt(i + 1)) continue;
        const swapped = `${body.slice(0, i)}${body.charAt(i + 1)}${body.charAt(i)}${body.slice(i + 2)}`;
        expect(isValidNewTicketCode(`TKT-${swapped}`)).toBe(false);
      }
    }
  });

  it("keeps older codes valid and readable as they were", () => {
    expect(isLegacyTicketCode("TKT-A1B2C3D4")).toBe(true);
    expect(formatTicketCodeForReading("TKT-A1B2C3D4")).toBe("TKT-A1B2C3D4");
    expect(normalizeTypedTicketCode("tkt-a1b2c3d4")).toEqual({
      ok: true,
      code: "TKT-A1B2C3D4",
    });
  });

  it("shows a new code in three groups of four", () => {
    const payload = "ABCDEFGHJKM";
    const code = `TKT-${payload}${ticketCodeCheckChar(payload)}`;
    expect(formatTicketCodeForReading(code)).toBe(
      `ABCD EFGH JKM${ticketCodeCheckChar(payload)}`,
    );
  });

  it("reads a typed code with or without prefix, spaces and hyphens", () => {
    const code = newTicketCode();
    const grouped = formatTicketCodeForReading(code);
    expect(normalizeTypedTicketCode(grouped)).toEqual({ ok: true, code });
    expect(normalizeTypedTicketCode(grouped.toLowerCase())).toEqual({
      ok: true,
      code,
    });
    expect(
      normalizeTypedTicketCode(`tkt ${grouped.replace(/ /g, "-")}`),
    ).toEqual({ ok: true, code });
  });

  it("refuses a typo before any lookup", () => {
    const code = newTicketCode();
    const body = code.slice(4);
    const wrong = body.charAt(0) === "A" ? "B" : "A";
    expect(normalizeTypedTicketCode(`${wrong}${body.slice(1)}`)).toEqual({
      ok: false,
      reason: "check",
    });
    expect(normalizeTypedTicketCode("")).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(normalizeTypedTicketCode("TKT-1234")).toEqual({
      ok: false,
      reason: "format",
    });
  });
});
