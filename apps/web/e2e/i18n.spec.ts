import { expect, test } from "@playwright/test";

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
