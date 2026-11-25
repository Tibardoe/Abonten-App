import { describe, expect, it } from "vitest";
import { hostDisplayName, hostName } from "./hostDisplayName";
import { t, tFr } from "./i18n/testTranslator";

describe("hostName", () => {
  it("names a deleted organizer as a former member, never 'Deleted user'", () => {
    const gone = {
      username: "deleted_3fa85f645717",
      full_name: "Deleted user",
      username_is_generated: true,
    };
    expect(hostName(t, gone)).toBe("Former Abonten member");
    expect(hostName(tFr, gone)).toBe(tFr("member.former"));
    expect(hostName(tFr, gone)).not.toContain("Deleted");
  });

  it("is hostDisplayName for everyone else", () => {
    expect(
      hostName(t, {
        username: "user16673156",
        full_name: "Pen it Multimedia Limited",
        username_is_generated: true,
      }),
    ).toBe("Pen it Multimedia Limited");
  });
});

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
