import { describe, expect, it } from "vitest";
import {
  listerSocialLinkFields,
  normalizeListerSocialLinks,
  parseListerSocialLink,
  readListerHandles,
} from "./listerSocialLinks";

describe("parseListerSocialLink", () => {
  it("reads a profile address on the network's own domains", () => {
    expect(
      parseListerSocialLink(
        "instagram",
        "https://www.instagram.com/abontenhub/",
      ),
    ).toEqual({
      network: "instagram",
      handle: "abontenhub",
      url: "https://www.instagram.com/abontenhub",
    });
    expect(
      parseListerSocialLink("instagram", "instagram.com/abonten.hub?igsh=abc"),
    ).toMatchObject({
      handle: "abonten.hub",
      url: "https://www.instagram.com/abonten.hub",
    });
    expect(
      parseListerSocialLink("x", "http://twitter.com/AbontenHub"),
    ).toMatchObject({ handle: "AbontenHub", url: "https://x.com/AbontenHub" });
    expect(
      parseListerSocialLink("x", "https://mobile.x.com/abonten_hub#top"),
    ).toMatchObject({ url: "https://x.com/abonten_hub" });
    expect(
      parseListerSocialLink(
        "tiktok",
        "https://www.tiktok.com/@abontenhub?lang=en",
      ),
    ).toMatchObject({
      handle: "abontenhub",
      url: "https://www.tiktok.com/@abontenhub",
    });
    expect(
      parseListerSocialLink("facebook", "https://m.facebook.com/AbontenHub"),
    ).toMatchObject({
      handle: "AbontenHub",
      url: "https://www.facebook.com/AbontenHub",
    });
  });

  it("turns a bare @handle (or a handle without its @) into the address", () => {
    expect(parseListerSocialLink("instagram", "@abontenhub")?.url).toBe(
      "https://www.instagram.com/abontenhub",
    );
    expect(parseListerSocialLink("instagram", "joe.comedy")?.url).toBe(
      "https://www.instagram.com/joe.comedy",
    );
    expect(parseListerSocialLink("x", " @abonten ")?.url).toBe(
      "https://x.com/abonten",
    );
    expect(parseListerSocialLink("tiktok", "@abontenhub")?.url).toBe(
      "https://www.tiktok.com/@abontenhub",
    );
    expect(parseListerSocialLink("facebook", "abontenhub")?.url).toBe(
      "https://www.facebook.com/abontenhub",
    );
  });

  it("keeps a Facebook profile known only by its number", () => {
    expect(
      parseListerSocialLink(
        "facebook",
        "https://www.facebook.com/profile.php?id=100089123456789",
      ),
    ).toEqual({
      network: "facebook",
      handle: null,
      url: "https://www.facebook.com/profile.php?id=100089123456789",
    });
    expect(
      parseListerSocialLink(
        "facebook",
        "https://www.facebook.com/people/Abonten-Hub/100089123456789/",
      )?.url,
    ).toBe("https://www.facebook.com/profile.php?id=100089123456789");
  });

  it("refuses other schemes, other hosts and anything that is not a profile", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(document.cookie)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://instagram.com/abonten",
      "https://instagram.com.evil.example/abonten",
      "https://evil.example/instagram.com/abonten",
      "https://user@instagram.com/abonten",
      "https://instagram.com:8443/abonten",
      "https://www.instagram.com/p/C0deX12/",
      "https://www.instagram.com/abonten/reels",
      "https://www.instagram.com/",
      "instagram.com",
      "@abonten hub",
      "@@abonten",
      "a".repeat(31),
      ".abonten",
      "abonten..hub",
    ]) {
      expect(parseListerSocialLink("instagram", bad), bad).toBeNull();
    }
    expect(parseListerSocialLink("x", "https://x.com/i/status/123")).toBeNull();
    expect(parseListerSocialLink("x", "https://x.com/home")).toBeNull();
    expect(
      parseListerSocialLink("x", "https://www.instagram.com/abonten"),
    ).toBeNull();
    expect(parseListerSocialLink("x", "way_too_long_handle_for_x")).toBeNull();
    expect(
      parseListerSocialLink("tiktok", "https://www.tiktok.com/abonten"),
    ).toBeNull();
    expect(
      parseListerSocialLink("tiktok", "https://vm.tiktok.com/ZMabc/"),
    ).toBeNull();
    expect(
      parseListerSocialLink(
        "facebook",
        "https://www.facebook.com/sharer/sharer.php?u=x",
      ),
    ).toBeNull();
    expect(
      parseListerSocialLink("facebook", "https://www.facebook.com/profile.php"),
    ).toBeNull();
    expect(parseListerSocialLink("facebook", "abc")).toBeNull();
    expect(parseListerSocialLink("instagram", 42)).toBeNull();
    expect(parseListerSocialLink("instagram", "   ")).toBeNull();
  });
});

describe("normalizeListerSocialLinks", () => {
  it("stores canonical addresses and leaves empty fields out", () => {
    expect(
      normalizeListerSocialLinks({
        instagram: "@abontenhub",
        x: "",
        tiktok: null,
        facebook: "facebook.com/AbontenHub",
      }),
    ).toEqual({
      ok: true,
      links: {
        instagram: "https://www.instagram.com/abontenhub",
        facebook: "https://www.facebook.com/AbontenHub",
      },
    });
  });

  it("is null when nothing is left", () => {
    expect(normalizeListerSocialLinks({ instagram: " ", x: "" })).toEqual({
      ok: true,
      links: null,
    });
    expect(normalizeListerSocialLinks(null)).toEqual({ ok: true, links: null });
  });

  it("names every refused entry, unknown networks too", () => {
    expect(
      normalizeListerSocialLinks({
        instagram: "javascript:alert(1)",
        x: "@fine",
        snapchat: "@abonten",
        tiktok: 7,
      }),
    ).toEqual({ ok: false, invalid: ["instagram", "snapchat", "tiktok"] });
    expect(normalizeListerSocialLinks(["@abonten"])).toEqual({
      ok: false,
      invalid: ["*"],
    });
    expect(normalizeListerSocialLinks("@abonten")).toEqual({
      ok: false,
      invalid: ["*"],
    });
  });
});

describe("readListerHandles", () => {
  it("reads a place's older keys and leaves out what does not parse", () => {
    expect(
      readListerHandles({
        twitter: "https://twitter.com/osu_lounge",
        instagram: "https://instagram.com/osu.lounge",
        facebook: "javascript:alert(1)",
        website: "https://osulounge.example",
      }),
    ).toEqual([
      {
        network: "instagram",
        handle: "osu.lounge",
        url: "https://www.instagram.com/osu.lounge",
      },
      { network: "x", handle: "osu_lounge", url: "https://x.com/osu_lounge" },
    ]);
  });

  it("is empty for nothing", () => {
    expect(readListerHandles(null)).toEqual([]);
    expect(readListerHandles("https://x.com/a")).toEqual([]);
    expect(readListerHandles([])).toEqual([]);
  });
});

describe("listerSocialLinkFields", () => {
  it("fills the four form fields", () => {
    expect(listerSocialLinkFields({ x: "https://x.com/abonten" })).toEqual({
      instagram: "",
      x: "https://x.com/abonten",
      tiktok: "",
      facebook: "",
    });
  });
});
