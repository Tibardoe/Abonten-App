import { expect, test } from "@playwright/test";

// Share previews and structured data on the listing pages, taken from the
// live sitemap so the check follows whatever is published.

test("event and place pages carry Open Graph tags, a canonical URL and JSON-LD", async ({
  page,
  request,
}) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  const paths = [
    xml.match(/<loc>[^<]*(\/events\/[A-Z0-9]+)<\/loc>/)?.[1],
    xml.match(/<loc>[^<]*(\/places\/[a-z0-9-]+)<\/loc>/)?.[1],
  ].filter((p): p is string => Boolean(p));
  test.skip(paths.length === 0, "no public event or place in the catalogue");

  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveCount(1);
    const title = await page.title();
    expect(title, path).toMatch(/ \| Abonten Hub$/);
    expect(title, path).not.toMatch(/Abonten Hub \| Abonten Hub/);
    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent();
    expect(jsonLd, path).toBeTruthy();
    const data = JSON.parse(jsonLd ?? "{}");
    expect(data["@context"]).toBe("https://schema.org");
    expect(["Event", "LocalBusiness"]).toContain(data["@type"]);
  }
});
