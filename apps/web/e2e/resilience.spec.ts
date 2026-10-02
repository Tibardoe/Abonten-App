import { type Page, expect, test } from "@playwright/test";

// A link only navigates in place once React has attached to it; before
// that a click loads the whole page and no progress bar is involved.
// Waiting for that is quicker and steadier than waiting for the network
// to go quiet.
async function hydrated(page: Page, selector: string) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return (
      !!el && Object.keys(el).some((key) => key.startsWith("__reactFiber"))
    );
  }, selector);
}

// What a visitor sees when the network is slow or gone. Nothing here needs
// an account: the pieces under test sit in the shell every page shares.

test("says so while the browser is offline, and stops when it is back", async ({
  page,
  context,
}) => {
  await page.goto("/help");
  const notice = page.locator("output").filter({ hasText: "You're offline" });
  await expect(notice).toHaveCount(0);

  await context.setOffline(true);
  await expect(notice).toBeVisible();

  await context.setOffline(false);
  await expect(notice).toHaveCount(0);
});

test("the offline notice is in the reader's language", async ({ browser }) => {
  const context = await browser.newContext({ locale: "fr-FR" });
  const page = await context.newPage();
  await page.goto("/help");
  await context.setOffline(true);
  await expect(
    page.locator("output").filter({ hasText: "Vous êtes hors ligne" }),
  ).toBeVisible();
  await context.close();
});

test("a slow navigation shows the progress bar until the page arrives", async ({
  page,
}) => {
  await page.goto("/help");
  await hydrated(page, 'footer a[href="/legal/terms"]');

  // The footer's links are not prefetched, so this page is fetched when the
  // link is clicked; hold the answer back as a slow connection would.
  await page.route("**/legal/terms**", async (route) => {
    if (route.request().headers().rsc === "1") {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    await route.continue();
  });

  const running = page.locator(".navigation-progress-running");
  await expect(running).toHaveCount(0);

  await page.locator('footer a[href="/legal/terms"]').click();
  await expect(running).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/help");

  await page.waitForURL("**/legal/terms");
  await expect(running).toHaveCount(0);
  await expect(page.locator(".navigation-progress-done")).toHaveCount(0);
});

test("a navigation to the page already open starts no progress bar", async ({
  page,
}) => {
  await page.goto("/help");
  await hydrated(page, 'a[href="/help"]');
  await page.locator('a[href="/help"]').first().click();
  await page.waitForTimeout(600);
  await expect(page.locator(".navigation-progress-running")).toHaveCount(0);
});
