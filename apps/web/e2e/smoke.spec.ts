import { expect, test } from "@playwright/test";

// The visitor-facing contract of the deployed web app: pages load, the
// security headers are on every response, signed-in areas redirect, the
// server-only endpoints refuse anonymous callers, and an unknown URL gets a
// real 404 page with the site's navigation.

test("home page renders with the brand title", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/Abonten Hub/);
  await expect(page.locator("main")).toHaveCount(1);
});

test("every page carries the security headers", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["content-security-policy"]).toContain(
    "https://js.paystack.co",
  );
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("robots.txt and sitemap.xml are public and consistent", async ({
  request,
}) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const body = await robots.text();
  expect(body).toContain("Disallow: /checkout/");
  expect(body).toContain("Sitemap:");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("xml");
  const xml = await sitemap.text();
  expect(xml).toContain("<urlset");
  expect(xml).toContain("/legal/terms");
});

test("a signed-out visitor is sent to sign in from a personal page, and comes back", async ({
  request,
}) => {
  const response = await request.get("/settings?tab=security", {
    maxRedirects: 0,
  });
  expect([302, 307]).toContain(response.status());
  const location = response.headers().location ?? "";
  expect(location).toContain("/auth/signin?next=");
  expect(decodeURIComponent(location)).toContain("/settings?tab=security");
});

test("private sections are marked noindex; public ones are not", async ({
  request,
}) => {
  const signin = await request.get("/auth/signin");
  expect(await signin.text()).toMatch(/<meta name="robots" content="noindex/);
  const legal = await request.get("/legal/terms");
  expect(await legal.text()).not.toMatch(
    /<meta name="robots" content="noindex/,
  );
});

test("the native app's API refuses a request without a bearer token", async ({
  request,
}) => {
  const response = await request.get("/api/mobile/notifications");
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.status).toBe(401);
});

test("the Paystack webhook refuses an unsigned delivery", async ({
  request,
}) => {
  const response = await request.post("/api/paystack/webhook", {
    data: { event: "charge.success", data: { reference: "x" } },
  });
  expect(response.status()).toBe(401);
});

test("an unknown URL is a real 404 with the site's navigation", async ({
  page,
}) => {
  const response = await page.goto("/this-page-does-not-exist-9f2c");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: /couldn't find that page/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /explore events and places/i }),
  ).toBeVisible();
  await expect(page.locator("header")).toBeVisible();
});

test("a missing event or place is a real 404, not a blank page", async ({
  page,
}) => {
  const event = await page.goto("/events/NOPE00");
  expect(event?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    /couldn't find/i,
  );
  const place = await page.goto("/places/no-such-place-9f2c");
  expect(place?.status()).toBe(404);
});

test("a location explore page renders its tabs and canonical URL", async ({
  page,
}) => {
  const response = await page.goto("/explore/accra?tab=places");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/Events and places in Accra/);
  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveAttribute("href", /\/explore\/accra$/);
});
