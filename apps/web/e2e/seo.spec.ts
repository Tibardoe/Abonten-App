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
