"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import {
  parseDiscoveryInput,
  requestIp,
  resolveDiscoveryCaller,
} from "@/utils/discoveryAction";
import { logger } from "@abonten/core/logger";
import { parseSearchQuery } from "@abonten/core/search/parseSearchQuery";
import { resolveDiscoveryAccess } from "@abonten/services/search/discoveryProgram";
import { searchCore } from "@abonten/services/search/searchCore";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import type { SearchResults } from "@abonten/types/searchType";
import { searchRequestSchema } from "@abonten/validation/discoverySchemas";

const emptyResults = (status: number, message: string): SearchResults => ({
  status,
  message,
  searchId: null,
  mode: "all",
  query: parseSearchQuery(""),
  events: { items: [], nextCursor: null, hasNextPage: false },
  places: { items: [], nextCursor: null, hasNextPage: false },
  organizers: { items: [], nextCursor: null, hasNextPage: false },
});

/** Unified search results for /search (events, places, organizers). */
export async function searchDiscovery(input: unknown): Promise<SearchResults> {
  const parsed = parseDiscoveryInput(searchRequestSchema, input);
  if (parsed.error) return emptyResults(400, parsed.error.message);

  try {
    const caller = await resolveDiscoveryCaller();
    const key = caller.userId
      ? `search:user:${caller.userId}`
      : `search:ip:${await requestIp()}`;
    if (!(await checkRateLimit(key, 60, 60))) {
      return emptyResults(
        429,
        "You are searching very quickly. Try again in a moment.",
      );
    }
    const { program, settings } = await resolveDiscoveryAccess(
      caller.svc,
      caller.userId,
    );
    return await searchCore(publicSupabase, parsed.data, {
      program,
      platform: "web",
      log: !parsed.data.cursor,
      loggingEnabled: settings?.search_logging_enabled ?? false,
    });
  } catch (error) {
    logger.error("searchDiscovery failed", error);
    return emptyResults(500, "Search is unavailable right now.");
  }
}
