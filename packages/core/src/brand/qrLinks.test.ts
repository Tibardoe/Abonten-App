import { describe, expect, it } from "vitest";
import {
  APP_STORE_LISTINGS,
  QR_LINKS,
  getTheAppPath,
  qrLinkDestination,
  qrLinkTarget,
  qrLinkUrl,
} from "./qrLinks";

describe("QR short links", () => {
  it("sends every printed code to a site path", () => {
    for (const { destination } of Object.values(QR_LINKS)) {
      expect(destination.startsWith("/")).toBe(true);
      expect(destination.startsWith("//")).toBe(false);
    }
  });

  it("keeps the codes already printed on artwork", () => {
    // Removing one of these strands every piece that carries it.
    expect(Object.keys(QR_LINKS).sort()).toEqual(
      [
        "akwaaba",
        "app",
        "discover",
        "organizers",
        "owner",
        "places",
        "tickets",
      ].sort(),
    );
  });

  it("resolves a code whatever its case or spacing", () => {
    expect(qrLinkDestination("organizers")).toBe(
      "/help/organizers/creating-and-publishing-events",
    );
    expect(qrLinkDestination(" Places ")).toBe(
      "/help/place-owners/managing-your-place",
    );
  });

  it("sends an unknown or inherited-property code home", () => {
    expect(qrLinkDestination("retired-campaign")).toBe("/");
    expect(qrLinkDestination("constructor")).toBe("/");
    expect(qrLinkDestination("")).toBe("/");
  });

  it("builds the absolute URL that goes in the code", () => {
    expect(qrLinkUrl("discover")).toBe("https://abontenhub.com/go/discover");
    expect(qrLinkUrl("owner", "http://localhost:3000/")).toBe(
      "http://localhost:3000/go/owner",
    );
  });

  describe("Get the app", () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
    const android =
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile";
    const desktop =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0";
    const listed = {
      ios: "https://apps.apple.com/app/id000000000",
      android: "https://play.google.com/store/apps/details?id=com.abonten.app",
    };

    it("opens the website while no store lists the app", () => {
      const none = { ios: null, android: null };
      expect(qrLinkTarget("app", iphone, none)).toBe("/");
      expect(qrLinkTarget("app", android, none)).toBe("/");
    });

    it("sends each phone to its own store once listed", () => {
      expect(qrLinkTarget("app", iphone, listed)).toBe(listed.ios);
      expect(qrLinkTarget("APP", android, listed)).toBe(listed.android);
      expect(qrLinkTarget("app", desktop, listed)).toBe("/");
      expect(qrLinkTarget("app", null, listed)).toBe("/");
    });

    it("uses the published listings by default (both live since 2026-11-17)", () => {
      expect(APP_STORE_LISTINGS.ios).toBe(
        "https://apps.apple.com/app/id6812440895",
      );
      expect(APP_STORE_LISTINGS.android).toBe(
        "https://play.google.com/store/apps/details?id=com.abonten.app",
      );
      expect(qrLinkTarget("app", iphone)).toBe(APP_STORE_LISTINGS.ios);
      expect(qrLinkTarget("app", android)).toBe(APP_STORE_LISTINGS.android);
    });

    it("hands an event or place through an Android install", () => {
      const query = new URLSearchParams("open=/events/ABCD1234&src=ig");
      const target = qrLinkTarget("app", android, listed, query);
      const url = new URL(target);
      expect(url.origin + url.pathname).toBe(
        "https://play.google.com/store/apps/details",
      );
      expect(url.searchParams.get("id")).toBe("com.abonten.app");
      expect(url.searchParams.get("referrer")).toBe(
        "open=%2Fevents%2Fabcd1234&src=ig",
      );
      expect(
        new URL(
          qrLinkTarget(
            "app",
            android,
            listed,
            new URLSearchParams("open=%2Fplaces%2Fkiosk-1a2b&src=nope"),
          ),
        ).searchParams.get("referrer"),
      ).toBe("open=%2Fplaces%2Fkiosk-1a2b");
    });

    it("ignores an open path that is not a listing", () => {
      for (const open of [
        "/manage/places",
        "https://evil.example/",
        "//evil.example/events/ABCD1234",
        "/events/ABCD1234/../../manage",
      ]) {
        expect(
          qrLinkTarget(
            "app",
            android,
            listed,
            new URLSearchParams({ open, src: "ig" }),
          ),
        ).toBe(listed.android);
      }
    });

    it("keeps the iPhone and computer answers with a listing", () => {
      const query = new URLSearchParams("open=/events/ABCD1234&src=ig");
      expect(qrLinkTarget("app", iphone, listed, query)).toBe(listed.ios);
      expect(qrLinkTarget("app", desktop, listed, query)).toBe("/");
      expect(qrLinkTarget("tickets", android, listed, query)).toBe(
        "/help/customers/your-tickets",
      );
    });

    it("builds the website's Get-the-app link for a listing", () => {
      expect(
        getTheAppPath(
          { kind: "event", code: "ABCD1234", path: "/events/abcd1234" },
          "wa",
        ),
      ).toBe("/go/app?open=%2Fevents%2Fabcd1234&src=wa");
      expect(
        getTheAppPath(
          { kind: "place", slug: "kiosk-1a2b", path: "/places/kiosk-1a2b" },
          null,
        ),
      ).toBe("/go/app?open=%2Fplaces%2Fkiosk-1a2b");
    });

    it("leaves every other code alone", () => {
      expect(qrLinkTarget("discover", iphone, listed)).toBe("/");
      expect(qrLinkTarget("tickets", android, listed)).toBe(
        "/help/customers/your-tickets",
      );
    });
  });
});
