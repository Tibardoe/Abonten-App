import { describe, expect, it, vi } from "vitest";
import { checkEnv, enforceEnv } from "./checkEnv";

const spec = {
  required: ["SUPABASE_URL", "SECRET"],
  recommended: ["RESEND"],
} as const;

describe("checkEnv", () => {
  it("treats blank strings as missing", () => {
    const report = checkEnv(
      { SUPABASE_URL: "https://x", SECRET: "   ", RESEND: undefined },
      spec,
    );
    expect(report).toEqual({
      missingRequired: ["SECRET"],
      missingRecommended: ["RESEND"],
      ok: false,
    });
  });

  it("passes when everything required is present", () => {
    expect(
      checkEnv({ SUPABASE_URL: "u", SECRET: "s", RESEND: "r" }, spec).ok,
    ).toBe(true);
  });
});

describe("enforceEnv", () => {
  it("throws for a required gap only in strict mode, and never prints values", () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    const report = checkEnv({ SUPABASE_URL: "u" }, spec);
    expect(() => enforceEnv(report, { app: "web", strict: true, log })).toThrow(
      /required configuration missing: SECRET/,
    );
    enforceEnv(report, { app: "web", strict: false, log });
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("RESEND"));
    for (const call of [...log.error.mock.calls, ...log.warn.mock.calls]) {
      expect(call[0]).not.toContain("u");
    }
  });
});
