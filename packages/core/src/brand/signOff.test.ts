import { describe, expect, it } from "vitest";
import { SIGN_OFF, signOff } from "./signOff";

describe("sign-off", () => {
  it("is the department and the branch, with no office line", () => {
    expect(SIGN_OFF).toBe("Entertainment Department, Earth Branch");
    expect(SIGN_OFF).not.toMatch(/office|accra/i);
  });

  it("builds the repeatable form", () => {
    expect(signOff("Compiled")).toBe(
      "Compiled by the Entertainment Department, Earth Branch",
    );
  });
});
