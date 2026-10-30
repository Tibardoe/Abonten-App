import { describe, expect, it } from "vitest";
import { promoCodeDraftGap } from "./promoCodeDraft";

const ok = { code: "EARLY", discount: "10", maxUses: "", expiry: "2026-11-30" };

describe("promoCodeDraftGap", () => {
  it("accepts a complete draft, with no limit on uses", () => {
    expect(promoCodeDraftGap(ok)).toBeNull();
  });

  it("names the first gap in the order the fields are shown", () => {
    expect(promoCodeDraftGap({ ...ok, code: "  ", expiry: null })).toBe("code");
    expect(promoCodeDraftGap({ ...ok, code: "X".repeat(41) })).toBe("code");
    expect(promoCodeDraftGap({ ...ok, discount: "0" })).toBe("discount");
    expect(promoCodeDraftGap({ ...ok, discount: "101" })).toBe("discount");
    expect(promoCodeDraftGap({ ...ok, discount: "12.5" })).toBe("discount");
    expect(promoCodeDraftGap({ ...ok, maxUses: "0" })).toBe("maxUses");
    expect(promoCodeDraftGap({ ...ok, expiry: null })).toBe("expiry");
  });

  it("asks for uses when the form needs a number", () => {
    expect(promoCodeDraftGap(ok, { maxUsesRequired: true })).toBe(
      "maxUsesRequired",
    );
    expect(
      promoCodeDraftGap({ ...ok, maxUses: "50" }, { maxUsesRequired: true }),
    ).toBeNull();
  });
});
