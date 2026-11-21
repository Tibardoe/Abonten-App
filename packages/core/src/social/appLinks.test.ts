import { describe, expect, it } from "vitest";
import { codeFromInstallReferrer } from "../rewards/invite";
import {
  appOpenFromInstallReferrer,
  appOpenQuery,
  appOpenTarget,
  appStoreAppId,
  smartAppBanner,
  withInstallReferrer,
} from "./appLinks";

describe("appOpenTarget", () => {
  it("accepts an event code, in either case, and links it in lower case", () => {
    expect(appOpenTarget("/events/ABCD1234")).toEqual({
      kind: "event",
      code: "ABCD1234",
      path: "/events/abcd1234",
    });
    expect(appOpenTarget("/events/tc4921")?.path).toBe("/events/tc4921");
  });

  it("accepts a place slug as it is", () => {
    expect(appOpenTarget("/places/republic-bar-9f2c1a7b")).toEqual({
      kind: "place",
      slug: "republic-bar-9f2c1a7b",
      path: "/places/republic-bar-9f2c1a7b",
    });
    expect(appOpenTarget("/places/the_shop-1a2b")?.path).toBe(
      "/places/the_shop-1a2b",
    );
  });

  it("refuses every other path", () => {
    for (const value of [
      "/",
      "/events",
      "/events/",
      "/places/",
      "/events/ABCD1234/reviews",
      "/events/ABCD1234/",
      "/events/ABCD1234?ref=X",
      "/events/ABCD1234#tickets",
      "/events/AB-CD",
      "/events/A",
      "/events/%41BCD",
      "/events/..",
      "/places/..",
      "/places/---",
      "/places/Republic-Bar",
      "/places/a b",
      "/places/a%2Fb",
      "/invite/K7QX2MA",
      "/user/someone/posts",
      "/manage/places",
      "/go/app",
      "events/ABCD1234",
      "//evil.example/events/ABCD1234",
      "https://abontenhub.com/events/ABCD1234",
      "https://evil.example/events/ABCD1234",
      "javascript:alert(1)",
      "/events/ABCD1234\n",
      " /events/ABCD1234",
      "\\events\\ABCD1234",
      `/places/${"a".repeat(121)}`,
      "",
    ]) {
      expect(appOpenTarget(value), value).toBeNull();
    }
  });

  it("refuses anything that is not a string", () => {
    expect(appOpenTarget(null)).toBeNull();
    expect(appOpenTarget(undefined)).toBeNull();
    expect(appOpenTarget(42)).toBeNull();
    expect(appOpenTarget(["/events/ABCD1234"])).toBeNull();
  });
});

describe("appOpenQuery", () => {
  const event = appOpenTarget("/events/ABCD1234");
  if (!event) throw new Error("fixture");

  it("encodes the path and adds a known source", () => {
    expect(appOpenQuery(event, "ig")).toBe("open=%2Fevents%2Fabcd1234&src=ig");
    expect(appOpenQuery(event, null)).toBe("open=%2Fevents%2Fabcd1234");
  });

  it("puts the pair on a Play Store link as its referrer", () => {
    const url = withInstallReferrer(
      "https://play.google.com/store/apps/details?id=com.abonten.app",
      appOpenQuery(event, "wa"),
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("id")).toBe("com.abonten.app");
    expect(parsed.searchParams.get("referrer")).toBe(
      "open=%2Fevents%2Fabcd1234&src=wa",
    );
  });
});

describe("appOpenFromInstallReferrer", () => {
  it("reads the listing and source Google Play hands back", () => {
    expect(
      appOpenFromInstallReferrer("open=%2Fevents%2Fabcd1234&src=ig"),
    ).toEqual({
      target: { kind: "event", code: "abcd1234", path: "/events/abcd1234" },
      source: "ig",
    });
  });

  it("reads a referrer that is still encoded once more, or not at all", () => {
    expect(
      appOpenFromInstallReferrer("open%3D%252Fplaces%252Fkiosk-1a2b%26src%3Dx"),
    ).toEqual({
      target: { kind: "place", slug: "kiosk-1a2b", path: "/places/kiosk-1a2b" },
      source: "x",
    });
    expect(
      appOpenFromInstallReferrer("open=/places/kiosk-1a2b")?.target.path,
    ).toBe("/places/kiosk-1a2b");
  });

  it("round-trips what the website builds", () => {
    const place = appOpenTarget("/places/republic-bar-9f2c1a7b");
    if (!place) throw new Error("fixture");
    const store = withInstallReferrer(
      "https://play.google.com/store/apps/details?id=com.abonten.app",
      appOpenQuery(place, "tt"),
    );
    const referrer = new URL(store).searchParams.get("referrer");
    expect(appOpenFromInstallReferrer(referrer)).toEqual({
      target: place,
      source: "tt",
    });
  });

  it("drops an unknown source but keeps the listing", () => {
    expect(
      appOpenFromInstallReferrer("open=%2Fevents%2Fabcd1234&src=newsletter"),
    ).toEqual({
      target: { kind: "event", code: "abcd1234", path: "/events/abcd1234" },
      source: null,
    });
  });

  it("is null for organic installs, invites and anything else", () => {
    expect(appOpenFromInstallReferrer(null)).toBeNull();
    expect(appOpenFromInstallReferrer(undefined)).toBeNull();
    expect(appOpenFromInstallReferrer("")).toBeNull();
    expect(
      appOpenFromInstallReferrer("utm_source=google-play&utm_medium=organic"),
    ).toBeNull();
    expect(appOpenFromInstallReferrer("ref=K7QX2MA")).toBeNull();
    expect(
      appOpenFromInstallReferrer("open=%2Fmanage%2Fplaces&src=ig"),
    ).toBeNull();
    expect(
      appOpenFromInstallReferrer("open=https%3A%2F%2Fevil.example%2F"),
    ).toBeNull();
    expect(appOpenFromInstallReferrer("open=%E0%A4%A")).toBeNull();
  });

  it("leaves a friend invite readable from the same string", () => {
    const referrer = "ref%3DK7QX2MA%26open%3D%252Fevents%252Fabcd1234";
    expect(codeFromInstallReferrer(referrer)).toBe("K7QX2MA");
    expect(appOpenFromInstallReferrer(referrer)?.target.path).toBe(
      "/events/abcd1234",
    );
  });
});

describe("Smart App Banner", () => {
  it("reads the app id from the App Store listing", () => {
    expect(appStoreAppId("https://apps.apple.com/app/id6812440895")).toBe(
      "6812440895",
    );
    expect(
      appStoreAppId("https://apps.apple.com/gh/app/abonten/id6812440895?l=fr"),
    ).toBe("6812440895");
    expect(appStoreAppId(null)).toBeNull();
    expect(appStoreAppId("https://apps.apple.com/app/abonten")).toBeNull();
  });

  it("names the app and the page's address", () => {
    expect(
      smartAppBanner(
        "/events/abcd1234",
        "https://apps.apple.com/app/id6812440895",
      ),
    ).toEqual({
      appId: "6812440895",
      appArgument: "https://abontenhub.com/events/abcd1234",
    });
    expect(
      smartAppBanner(
        "/places/kiosk-1a2b",
        "https://apps.apple.com/app/id6812440895",
        "http://localhost:3000/",
      )?.appArgument,
    ).toBe("http://localhost:3000/places/kiosk-1a2b");
  });

  it("is absent while the app is not on the App Store", () => {
    expect(smartAppBanner("/events/abcd1234", null)).toBeNull();
  });
});
