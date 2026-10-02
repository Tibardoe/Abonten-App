import { expect, test } from "@playwright/test";
import { publicCatalogue } from "./catalogue";

// The language a visitor gets, end to end: negotiated from the browser on
// the first visit, remembered in the preference cookie, rendered on the
// server (so the very first paint and <html lang> are already right), and
// never visible in the address. A French-only visitor must be able to use
// the site without reading a word of English.

test("a French browser gets a French page on first visit, and the cookie remembers it", async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: "fr-FR" });
  const page = await context.newPage();
  const response = await page.goto("/help");
  expect(response?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");

  const cookies = await context.cookies();
  const locale = cookies.find((c) => c.name === "NEXT_LOCALE");
  expect(locale?.value).toBe("fr");

  // The address stays clean: no /fr/ prefix is ever shown or needed.
  expect(new URL(page.url()).pathname).toBe("/help");
  await context.close();
});

test("an unsupported browser language falls back to English", async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: "ja-JP" });
  const page = await context.newPage();
  await page.goto("/legal");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await context.close();
});

test("the preference cookie wins over the browser language", async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: "fr-FR" });
  await context.addCookies([
    {
      name: "NEXT_LOCALE",
      value: "es",
      url: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3010",
    },
  ]);
  const page = await context.newPage();
  await page.goto("/legal");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await context.close();
});

test("the internal locale route is not a public address", async ({
  request,
}) => {
  // The proxy rewrites "/legal" to "/fr/legal" internally; the prefixed
  // form must not become a second, indexable URL for the same page.
  const response = await request.get("/fr/legal", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
});

test("the site's own API and short links are not rewritten", async ({
  request,
}) => {
  const api = await request.get("/api/mobile/notifications");
  expect(api.status()).toBe(401);
  const body = await api.json();
  expect(body.status).toBe(401);
});

test("every language renders the public pages with its own <html lang>", async ({
  browser,
}) => {
  for (const locale of ["en", "fr", "es", "de", "pt", "ak"]) {
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: "NEXT_LOCALE",
        value: locale,
        url: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3010",
      },
    ]);
    const page = await context.newPage();
    for (const path of ["/", "/help", "/legal/terms", "/weekly"]) {
      const response = await page.goto(path);
      expect(response?.status(), `${locale} ${path}`).toBe(200);
      await expect(page.locator("html"), `${locale} ${path}`).toHaveAttribute(
        "lang",
        locale,
      );
      // A raw message key on screen means a catalog is missing an entry.
      const text = await page.locator("body").innerText();
      expect(text, `${locale} ${path}`).not.toMatch(
        /\b(common|navigation|settings|events|places|auth)\.[a-zA-Z]+\.[a-zA-Z]+\b/,
      );
    }
    await context.close();
  }
});

test("a page brings the words it uses, and only those", async ({
  browser,
  request,
}) => {
  // Until 2026-10-01 every page carried all 32 catalogs in its HTML: about
  // 340 KB of JSON on the home page. A page now carries the messages its
  // own client components read (scripts/i18n/gen-route-messages.mjs). Two
  // things would undo that quietly, so both are held here:
  //
  //   - the HTML growing back (a provider handing over every catalog);
  //   - a message the analysis missed, which still shows (the namespace is
  //     fetched on the spot) but arrives late. window.__abontenLateMessages
  //     lists those.
  const home = await request.get("/", {
    headers: { cookie: "NEXT_LOCALE=fr" },
  });
  expect(home.status()).toBe(200);
  const bytes = (await home.body()).byteLength;
  expect(bytes, `the home page is ${bytes} bytes of HTML`).toBeLessThan(
    150_000,
  );

  const catalogue = await publicCatalogue(request);
  const paths = [
    "/",
    "/explore",
    "/search",
    "/help",
    "/weekly",
    "/auth/signin",
    ...(catalogue.event ? [catalogue.event, `${catalogue.event}/reviews`] : []),
    ...(catalogue.place ? [catalogue.place, `${catalogue.place}/reviews`] : []),
  ];
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "NEXT_LOCALE",
      value: "fr",
      url: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3010",
    },
  ]);
  const page = await context.newPage();
  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    // Long enough for the page's own first effects to have rendered.
    await page.waitForTimeout(1500);
    const late = await page.evaluate(
      () =>
        (window as unknown as { __abontenLateMessages?: string[] })
          .__abontenLateMessages ?? [],
    );
    expect(late, `${path} had to fetch messages after it arrived`).toEqual([]);
    // Nothing on screen is waiting for its words either: a control with an
    // empty name is what a missed message looks like before the fetch.
    const unnamed = await page.evaluate(
      () =>
        [...document.querySelectorAll("[aria-label], [placeholder]")].filter(
          (el) =>
            ["aria-label", "placeholder"].some(
              (name) =>
                el.getAttribute(name) !== null &&
                el.getAttribute(name)?.trim() === "",
            ),
        ).length,
    );
    expect(unnamed, `${path} has controls without a name`).toBe(0);
  }
  await context.close();
});

test("profile tabs lead to pages that exist, in every language", async ({
  browser,
  request,
}) => {
  // The tabs' links were built from their translated labels until
  // 2026-10-01: "/user/<name>/lieux" for a French reader, a 404.
  const catalogue = await publicCatalogue(request);
  test.skip(!catalogue.event, "no public event to find an organizer through");
  for (const locale of ["fr", "de"]) {
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: "NEXT_LOCALE",
        value: locale,
        url: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3010",
      },
    ]);
    const page = await context.newPage();
    await page.goto(catalogue.event as string);
    const profile = page.locator('a[href^="/user/"]').first();
    test.skip(
      (await profile.count()) === 0,
      "the event page does not link to its organizer",
    );
    const href = (await profile.getAttribute("href")) as string;
    const username = href.split("/")[2];
    await page.goto(`/user/${username}/posts`);
    const tabs = await page
      .locator(`a[href^="/user/${username}/"]`)
      .evaluateAll((links) =>
        links.map((link) => (link as HTMLAnchorElement).getAttribute("href")),
      );
    expect(tabs.length, `${locale}: no profile tabs`).toBeGreaterThan(0);
    for (const tab of new Set(tabs)) {
      const response = await request.get(tab as string, {
        headers: { cookie: `NEXT_LOCALE=${locale}` },
      });
      expect(response.status(), `${locale}: ${tab}`).toBe(200);
    }
    await context.close();
  }
});
