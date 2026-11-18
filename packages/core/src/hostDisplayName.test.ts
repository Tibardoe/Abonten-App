import { describe, expect, it } from "vitest";
import { hostDisplayName } from "./hostDisplayName";

describe("hostDisplayName", () => {
  it("shows a chosen username", () => {
    expect(
      hostDisplayName({
        username: "ghanafoodfestival",
        full_name: "Pen it Multimedia Limited",
        username_is_generated: false,
      }),
    ).toBe("ghanafoodfestival");
  });

  it("shows the full name while the username is a placeholder", () => {
    expect(
      hostDisplayName({
        username: "user16673156",
        full_name: "Pen it Multimedia Limited",
        username_is_generated: true,
      }),
    ).toBe("Pen it Multimedia Limited");
  });

  it("keeps the placeholder when there is no full name", () => {
    expect(
      hostDisplayName({
        username: "user16673156",
        full_name: "  ",
        username_is_generated: true,
      }),
    ).toBe("user16673156");
  });

  it("treats a missing flag as a chosen username", () => {
    expect(
      hostDisplayName({ username: "abontenevents", full_name: "Abonten" }),
    ).toBe("abontenevents");
  });
});
