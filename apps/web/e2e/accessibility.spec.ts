import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";

// axe-core over the public surface. Serious and critical violations fail
// the build; moderate ones are reported so they are visible without
// blocking. Pages that need real data (an event, a place) are taken from
// the live sitemap so the scan follows the catalogue instead of a fixture.

const STATIC_PAGES = [
  "/",
  "/explore/accra",
  "/help",
  "/legal/terms",
  "/weekly",
];

async function scan(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), `${path} did not load`).toBe(200);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    // Third-party map tiles and embeds are outside this app's control.
    .exclude("iframe")
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const summary = blocking
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join("\n  ")}`,
    )
    .join("\n");
  expect(blocking, `${path}\n${summary}`).toEqual([]);
  return results;
}

for (const path of STATIC_PAGES) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await scan(page, path);
  });
}

test("no serious accessibility violations on a live event and place page", async ({
  page,
  request,
}) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  const event = xml.match(/<loc>[^<]*(\/events\/[A-Z0-9]+)<\/loc>/)?.[1];
  const place = xml.match(/<loc>[^<]*(\/places\/[a-z0-9-]+)<\/loc>/)?.[1];
  test.skip(!event && !place, "no public event or place in the catalogue");
  if (event) await scan(page, event);
  if (place) await scan(page, place);
  // Their full reviews pages (breakdown, filters, sort, review rows).
  if (event) await scan(page, `${event}/reviews`);
  if (place) await scan(page, `${place}/reviews`);
});
