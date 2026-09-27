import { type APIRequestContext, expect, test } from "@playwright/test";

export type Catalogue = { event?: string; place?: string };

/**
 * The first public event and place page in the sitemap.
 *
 * CI seeds one of each into its own local database
 * (scripts/test-db/seed-e2e.mjs) and sets E2E_REQUIRE_CATALOGUE, so there a
 * missing listing fails the run: until 2026-09-27 these checks quietly
 * skipped in CI because the database it pointed at answered every read with
 * 401. A local run against an empty database still skips.
 */
export async function publicCatalogue(
  request: APIRequestContext,
): Promise<Catalogue> {
  const xml = await (await request.get("/sitemap.xml")).text();
  const catalogue: Catalogue = {
    event: xml.match(/<loc>[^<]*(\/events\/[A-Z0-9]+)<\/loc>/)?.[1],
    place: xml.match(/<loc>[^<]*(\/places\/[a-z0-9-]+)<\/loc>/)?.[1],
  };
  if (process.env.E2E_REQUIRE_CATALOGUE) {
    expect(catalogue.event, "no event page in the sitemap").toBeTruthy();
    expect(catalogue.place, "no place page in the sitemap").toBeTruthy();
  } else {
    test.skip(
      !catalogue.event && !catalogue.place,
      "no public event or place in the catalogue",
    );
  }
  return catalogue;
}
