import { defineConfig, devices } from "@playwright/test";

// Browser-level checks for the web app: the pages a visitor actually loads,
// the headers they get, the redirects that protect signed-in areas and an
// accessibility scan of the public surface. They run against a production
// server (`next start`) so what is tested is what is deployed — the CSP,
// the static pages, the route protection — not the dev server's shortcuts.
//
// Locally: `npm run build && npx playwright test` in apps/web (needs the
// app's .env.local, and the Chromium download from `npx playwright install
// chromium`). In CI the e2e-web job builds first and reuses the same env.

const PORT = Number(process.env.E2E_PORT ?? 3010);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
