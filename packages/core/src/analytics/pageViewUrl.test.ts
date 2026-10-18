import { describe, expect, it } from "vitest";
import { pageViewUrl } from "./pageViewUrl";

const SITE = "https://abontenhub.com";

describe("pageViewUrl", () => {
  it("keeps the address of public listings", () => {
    for (const path of [
      "/",
      "/events/TUBP9BP",
      "/events/TUBP9BP/reviews",
      "/events/location/accra/explore/music",
      "/places/osu-food-court",
      "/explore/accra",
      "/weekly/ghana/2026-10-19",
      "/spotlight/0c9d",
      "/stories/0c9d",
      "/help/getting-started/sign-in",
      "/legal/privacy",
      "/user/abontenevents",
      "/user/abontenevents/reviews",
    ]) {
      expect(pageViewUrl(`${SITE}${path}`)).toBe(`${SITE}${path}`);
    }
  });

  it("cuts private pages to their first segment", () => {
    expect(pageViewUrl(`${SITE}/consent/field/eyJhbGciOi.sig`)).toBe(
      `${SITE}/consent`,
    );
    expect(pageViewUrl(`${SITE}/weekly/preview/tok123`)).toBe(`${SITE}/weekly`);
    expect(pageViewUrl(`${SITE}/messages/7f3a-uuid`)).toBe(`${SITE}/messages`);
    expect(pageViewUrl(`${SITE}/checkout/chk_42`)).toBe(`${SITE}/checkout`);
    expect(pageViewUrl(`${SITE}/invite/K7QX2MA`)).toBe(`${SITE}/invite`);
    expect(pageViewUrl(`${SITE}/search/kofi%20mensah`)).toBe(`${SITE}/search`);
    expect(pageViewUrl(`${SITE}/manage/events/123`)).toBe(`${SITE}/manage`);
    expect(pageViewUrl(`${SITE}/settings/security`)).toBe(`${SITE}/settings`);
    expect(pageViewUrl(`${SITE}/user/kofi/bookings`)).toBe(`${SITE}/user`);
    expect(pageViewUrl(`${SITE}/user/kofi/favorites`)).toBe(`${SITE}/user`);
  });

  it("keeps a link's campaign tags and drops every other parameter", () => {
    expect(
      pageViewUrl(
        `${SITE}/events/TUBP9BP?utm_source=instagram&ref=K7QX2MA&utm_campaign=osu-week1&q=x#tickets`,
      ),
    ).toBe(
      `${SITE}/events/TUBP9BP?utm_source=instagram&utm_campaign=osu-week1`,
    );
    expect(pageViewUrl(`${SITE}/auth/signin?code=abc&next=%2Fwallet`)).toBe(
      `${SITE}/auth`,
    );
    expect(pageViewUrl(`${SITE}/unsubscribe/rewards?token=signed`)).toBe(
      `${SITE}/unsubscribe`,
    );
  });

  it("drops a view whose address cannot be read", () => {
    expect(pageViewUrl("not a url")).toBeNull();
  });
});
