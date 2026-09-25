import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Production gate (2026-09-25): the public location pages geocode whatever
// text is in the URL. Google is faked here; every call to it would be a
// billed request.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  GEOCODE_GLOBAL_PER_HOUR,
  GEOCODE_PER_ADDRESS_LIMIT,
  type GeocodeLookup,
  geocodePlaceName,
  normalizePlaceQuery,
} from "../geo/placeNameGeocode";
import { invalidateMarketCache } from "../markets/marketConfig";
import { getServiceClient } from "./setupClient";

describe("public place-name geocoding stays inside its budget", () => {
  let service: SupabaseClient<Database>;
  const lookup = vi.fn<GeocodeLookup>();
  const run = `gate${Date.now().toString(36)}`;

  async function clean() {
    await service.from("geocode_cache").delete().like("query_key", `${run}%`);
    await service
      .from("rate_limit_bucket" as never)
      .delete()
      .like("key", "geocode-page:%");
  }

  beforeAll(async () => {
    service = getServiceClient();
    invalidateMarketCache();
    await clean();
  });

  afterEach(async () => {
    lookup.mockReset();
    await clean();
  });

  afterAll(clean);

  it("answers a market city without asking Google", async () => {
    const result = await geocodePlaceName({
      query: "cape-coast",
      ipAddress: "203.0.113.1",
      lookup,
    });
    expect(result.lat).not.toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("asks Google once per name, found or not", async () => {
    lookup.mockImplementation(async (q) =>
      q.endsWith("nowhere") ? "not_found" : { lat: 5.64, lng: -0.15 },
    );
    for (let i = 0; i < 3; i++) {
      const found = await geocodePlaceName({
        query: `${run}-east-legon`,
        ipAddress: `203.0.113.${10 + i}`,
        lookup,
      });
      expect(found).toEqual({ lat: 5.64, lng: -0.15 });
      const missing = await geocodePlaceName({
        query: `${run} nowhere`,
        ipAddress: `203.0.113.${10 + i}`,
        lookup,
      });
      expect(missing.lat).toBeNull();
    }
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("stops asking Google for one address after its budget", async () => {
    lookup.mockResolvedValue("not_found");
    for (let i = 0; i < GEOCODE_PER_ADDRESS_LIMIT + 5; i++) {
      await geocodePlaceName({
        query: `${run} made up ${i}`,
        ipAddress: "203.0.113.50",
        lookup,
      });
    }
    expect(lookup).toHaveBeenCalledTimes(GEOCODE_PER_ADDRESS_LIMIT);
  });

  it("stops asking Google for everyone once the hourly budget is spent", async () => {
    lookup.mockResolvedValue("not_found");
    for (let i = 0; i < GEOCODE_GLOBAL_PER_HOUR; i += 50) {
      await Promise.all(
        Array.from({ length: 50 }, () =>
          service.rpc("consume_rate_limit", {
            p_key: "geocode-page:global",
            p_limit: GEOCODE_GLOBAL_PER_HOUR,
            p_window_seconds: 3600,
          }),
        ),
      );
    }
    const result = await geocodePlaceName({
      query: `${run} fresh name`,
      ipAddress: "203.0.113.60",
      lookup,
    });
    expect(result.error).toBe("Location lookup unavailable");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses text that cannot be a place name", () => {
    expect(normalizePlaceQuery("x".repeat(500))).toBeNull();
    expect(normalizePlaceQuery("%%%")).toBeNull();
    expect(normalizePlaceQuery("East-Legon%2C%20Accra")).toBe(
      "east legon, accra",
    );
    expect(normalizePlaceQuery("Bouaké")).toBe("bouake");
  });
});
