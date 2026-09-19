import { expect, test } from "@playwright/test";

// The session proxy protects an explicit list of private sections
// (PROTECTED_PREFIXES in src/config/supabase/middleware.ts). That model is
// "public unless listed", so a section left off the list is silently world
// readable — exactly the mistake this file exists to catch. Every private
// section is asserted here; add a row whenever a private area is created.

const PRIVATE = [
  "/admin",
  "/checkout",
  "/consent",
  "/field",
  "/finances",
  "/for-you",
  "/manage",
  "/messages",
  "/notifications",
  "/plans",
  "/rewards",
  "/settings",
  "/transactions",
  "/user-account",
  "/wallet",
];

// Public discovery and the documents a visitor must be able to read before
// they agree to anything. A redirect here would be a different regression.
const PUBLIC = [
  "/",
  "/explore/accra",
  "/events",
  "/places",
  "/help",
  "/legal/terms",
  "/weekly",
  "/auth/signin",
  "/notifications/open",
  "/account-restricted",
];

for (const path of PRIVATE) {
  test(`signed-out visitor is sent to sign in from ${path}`, async ({
    request,
  }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(
      [302, 307],
      `${path} did not redirect (status ${response.status()})`,
    ).toContain(response.status());
    expect(response.headers().location ?? "").toContain("/auth/signin?next=");
  });
}

for (const path of PUBLIC) {
  test(`signed-out visitor is not bounced from ${path}`, async ({
    request,
  }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    // The property under test is "no session required". A 404 is a fine
    // answer for a prefix with no index page (/places only has
    // /places/[slug]); a redirect to sign-in, or a server error, is not.
    expect(response.headers().location ?? "").not.toContain("/auth/signin");
    expect(response.status(), `${path} returned a server error`).toBeLessThan(
      500,
    );
  });
}

test("the billed geocoding proxy refuses an anonymous caller with JSON, not a redirect", async ({
  request,
}) => {
  // It is an API route: it must answer 401 rather than 307 to an HTML page,
  // and it must not spend Google quota for a caller with no account.
  const response = await request.get("/api/geocode?address=Accra", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(401);
  expect(response.headers()["content-type"]).toContain("application/json");
});
