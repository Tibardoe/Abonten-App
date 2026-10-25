import { expect, test } from "@playwright/test";
import { publicCatalogue } from "./catalogue";

// Share previews and structured data on the listing pages, taken from the
// sitemap so the check follows whatever is published (in CI: the seeded
// event and place, see ./catalogue.ts).

test("event and place pages carry Open Graph tags, a canonical URL and JSON-LD", async ({
  page,
  request,
}) => {
  const { event, place } = await publicCatalogue(request);
  const paths = [event, place].filter((p): p is string => Boolean(p));

  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveCount(1);
    const title = await page.title();
    expect(title, path).toMatch(/ \| Abonten Hub$/);
    expect(title, path).not.toMatch(/Abonten Hub \| Abonten Hub/);
    // The canonical is the address every link uses (lower-case event code).
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`${path.replace(/[/-]/g, "$&")}$`),
    );
    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent();
    expect(jsonLd, path).toBeTruthy();
    const data = JSON.parse(jsonLd ?? "{}");
    expect(data["@context"]).toBe("https://schema.org");
    const nodes: { "@type": string; "@id"?: string }[] = data["@graph"];
    const types = nodes.map((n) => n["@type"]);
    expect(types, path).toContain("BreadcrumbList");
    if (path.startsWith("/events/")) {
      expect(types, path).toContain("Event");
    } else {
      // A LocalBusiness, or the closer kind its category names (Restaurant…).
      expect(
        nodes.some((n) => n["@id"]?.endsWith("#place")),
        path,
      ).toBe(true);
    }
  }
});

// The homepage names the site and its organization for search results,
// carries its own canonical, and links to the launched cities' pages, which
// are indexable; a location that is not a city is a working page that stays
// out of the index.
test("the homepage and the city pages are what search engines are shown", async ({
  page,
  request,
}) => {
  const home = await page.goto("/");
  expect(home?.status()).toBe(200);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /^https:\/\/abontenhub\.com\/?$/,
  );
  const jsonLd = JSON.parse(
    (await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent()) ?? "{}",
  );
  const types = (jsonLd["@graph"] as { "@type": string }[]).map(
    (n) => n["@type"],
  );
  expect(types).toEqual(expect.arrayContaining(["Organization", "WebSite"]));
  await expect(page.locator('a[href="/explore/accra"]')).toHaveCount(1);

  await page.goto("/explore/accra?lat=5.6037&lng=-0.187");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/explore\/accra$/,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Accra");

  await page.goto("/explore/current-location?lat=5.6037&lng=-0.187");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/explore/accra</loc>");
  expect(sitemap).not.toMatch(/\/events\/[A-Z0-9]*[A-Z][A-Z0-9]*<\/loc>/);

  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect((await manifest.json()).name).toBe("Abonten Hub");
});

// The full reviews page of an event and a place: public, server-rendered
// (a crawler or a link unfurler sees the reviews), its own canonical URL,
// and a shared-review link that no longer resolves degrades to the list
// instead of an error.
test("event and place reviews pages render publicly with their own canonical URL", async ({
  page,
  request,
}) => {
  const { event, place } = await publicCatalogue(request);
  const paths = [event, place].filter((p): p is string => Boolean(p));

  for (const path of paths) {
    const reviews = `${path}/reviews`;
    const response = await page.goto(
      `${reviews}?review=00000000-0000-4000-8000-000000000000`,
    );
    expect(response?.status(), reviews).toBe(200);
    expect(await page.title(), reviews).toMatch(
      /^Reviews of .+ \| Abonten Hub$/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`${reviews.replace(/[/-]/g, "$&")}$`),
    );
    await expect(page.getByRole("heading", { name: "Reviews" })).toBeVisible();
  }
});

// The root layout's title template appends " | Abonten Hub" once; a page
// that also writes it into its own title shows the brand twice in the tab
// (the Weekly pages did until 2026-09-27).
test("page titles carry the brand exactly once", async ({ page }) => {
  for (const path of ["/", "/weekly", "/spotlight", "/help", "/legal"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
    const title = await page.title();
    expect(title, path).toContain("Abonten Hub");
    expect(title, path).not.toMatch(/Abonten Hub.*Abonten Hub/);
  }
});

// Sharing the homepage (or any page without its own image) shows the brand
// preview instead of a bare link.
test("pages without their own preview image fall back to the brand card", async ({
  page,
}) => {
  for (const path of ["/", "/help"]) {
    await page.goto(path);
    const image = await page
      .locator('meta[property="og:image"]')
      .first()
      .getAttribute("content");
    expect(image, path).toContain("/assets/images/brand/og-default.jpg");
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
  }
});

// Addresses carry no language, so each language's version of a translated
// page is the address with ?hl=<locale>: its canonical in that language,
// and every language listed as an alternate (hreflang), here and in the
// sitemap. The legal pages are English only and list no alternates.
test("translated pages name their language versions for search engines", async ({
  page,
  request,
}) => {
  await page.goto("/help/customers/getting-started?hl=fr");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/help\/customers\/getting-started\?hl=fr$/,
  );
  for (const [lang, suffix] of [
    ["en", "/help/customers/getting-started"],
    ["fr", "?hl=fr"],
    ["pt", "?hl=pt"],
    ["x-default", "/help/customers/getting-started"],
  ]) {
    const href = await page
      .locator(`link[rel="alternate"][hreflang="${lang}"]`)
      .getAttribute("href");
    expect(href?.endsWith(suffix), `${lang}: ${href}`).toBe(true);
  }
  await expect(page.locator('link[hreflang="ak"]')).toHaveCount(0);

  await page.goto("/help/customers/getting-started?hl=en");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/help\/customers\/getting-started$/,
  );

  await page.goto("/legal/terms");
  await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain('hreflang="fr"');
  expect(sitemap).toMatch(/\/help\/customers\/getting-started\?hl=de/);
});
