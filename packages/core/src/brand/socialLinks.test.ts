import { describe, expect, it } from "vitest";
import { SOCIAL_LINKS } from "./socialLinks";

describe("SOCIAL_LINKS", () => {
  it("lists each network once, over https", () => {
    const keys = SOCIAL_LINKS.map((link) => link.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const link of SOCIAL_LINKS) {
      expect(new URL(link.href).protocol).toBe("https:");
      expect(link.label.length).toBeGreaterThan(0);
    }
  });

  it("offers the WhatsApp Channel to follow, but not as an identity page", () => {
    const channel = SOCIAL_LINKS.find((link) => link.key === "whatsapp");
    expect(channel?.href).toBe(
      "https://whatsapp.com/channel/0029Vb9N5fXCRs1lYPBl7Q00",
    );
    expect(channel?.profile).toBe(false);
    expect(
      SOCIAL_LINKS.filter((link) => link.key !== "whatsapp").every(
        (link) => link.profile,
      ),
    ).toBe(true);
  });
});
