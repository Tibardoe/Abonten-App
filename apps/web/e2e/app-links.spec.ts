import { expect, test } from "@playwright/test";
import { publicCatalogue } from "./catalogue";

// Getting the app from an event or place page, then landing on that listing
// (docs/architecture/social-distribution.md): Safari's Smart App Banner on
// an iPhone, and on Android a "Get the app" button whose Google Play link
// carries the listing through the install.

const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

test("event and place pages name the App Store app and their own address", async ({
  page,
  request,
}) => {
  const { event, place } = await publicCatalogue(request);
  for (const path of [event, place].filter((p): p is string => Boolean(p))) {
    await page.goto(path);
    await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveAttribute(
      "content",
      new RegExp(
        `^app-id=\\d+, app-argument=https://abontenhub\\.com${escapeRegExp(path)}$`,
      ),
    );
  }
});

test.describe("on an Android phone", () => {
  test.use({ userAgent: ANDROID });

  test("Get the app links to /go/app with the listing and the page's source", async ({
    page,
    request,
  }) => {
    const { event, place } = await publicCatalogue(request);
    const paths = [event, place].filter((p): p is string => Boolean(p));
    for (const path of paths) {
      await page.goto(`${path}?src=ig`);
      const link = page.locator('a[href^="/go/app?"]');
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute(
        "href",
        `/go/app?open=${encodeURIComponent(path)}&src=ig`,
      );
    }
    // An unknown source is not passed on.
    if (paths[0]) {
      await page.goto(`${paths[0]}?src=newsletter`);
      await expect(page.locator('a[href^="/go/app?"]')).toHaveAttribute(
        "href",
        `/go/app?open=${encodeURIComponent(paths[0])}`,
      );
    }
  });
});

for (const [name, userAgent] of [
  ["an iPhone (Safari's banner instead)", IPHONE],
  ["a computer", undefined],
] as const) {
  test.describe(`on ${name}`, () => {
    if (userAgent) test.use({ userAgent });

    test("no Get the app button is added", async ({ page, request }) => {
      const { event, place } = await publicCatalogue(request);
      for (const path of [event, place].filter((p): p is string =>
        Boolean(p),
      )) {
        await page.goto(path);
        await expect(page.locator("h1").first()).toBeVisible();
        await expect(page.locator('a[href^="/go/app?"]')).toHaveCount(0);
      }
    });
  });
}

test("/go/app hands an event or place to the Play Store as the install referrer", async ({
  request,
}) => {
  const go = (query: string, userAgent: string) =>
    request.get(`/go/app${query}`, {
      headers: { "user-agent": userAgent },
      maxRedirects: 0,
    });

  const event = await go("?open=%2Fevents%2FABCD1234&src=ig", ANDROID);
  expect(event.status()).toBe(307);
  expect(event.headers()["cache-control"]).toContain("no-store");
  const store = new URL(event.headers().location ?? "");
  expect(store.hostname).toBe("play.google.com");
  expect(store.searchParams.get("id")).toBe("com.abonten.app");
  expect(store.searchParams.get("referrer")).toBe(
    "open=%2Fevents%2Fabcd1234&src=ig",
  );

  // Anything that is not an event or a place is ignored.
  for (const open of [
    "https%3A%2F%2Fevil.example%2F",
    "%2F%2Fevil.example%2Fevents%2FABCD1234",
    "%2Fmanage%2Fplaces",
  ]) {
    const response = await go(`?open=${open}&src=ig`, ANDROID);
    const location = new URL(response.headers().location ?? "");
    expect(location.hostname).toBe("play.google.com");
    expect(location.searchParams.get("referrer")).toBeNull();
  }

  // The App Store has no referrer: an iPhone gets the plain listing.
  const iphone = await go("?open=%2Fevents%2FABCD1234&src=ig", IPHONE);
  expect(new URL(iphone.headers().location ?? "").hostname).toBe(
    "apps.apple.com",
  );
});
