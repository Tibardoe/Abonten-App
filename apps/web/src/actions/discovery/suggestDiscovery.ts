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
import { suggestCore } from "@abonten/services/search/searchCore";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import type { SearchSuggestionsResponse } from "@abonten/types/searchType";
import { searchSuggestSchema } from "@abonten/validation/discoverySchemas";

function fallback(status: number, message: string): SearchSuggestionsResponse {
  return {
    status,
    message,
    query: parseSearchQuery(""),
    events: [],
    places: [],
    organizers: [],
  };
}

/** Type-ahead suggestions for the search bar (events, places, organizers, "@" mode). */
export async function suggestDiscovery(
  input: unknown,
): Promise<SearchSuggestionsResponse> {
  const parsed = parseDiscoveryInput(searchSuggestSchema, input);
  if (parsed.error) return fallback(400, parsed.error.message);

  try {
    const caller = await resolveDiscoveryCaller();
    const key = caller.userId
      ? `search-suggest:user:${caller.userId}`
      : `search-suggest:ip:${await requestIp()}`;
    if (!(await checkRateLimit(key, 180, 60))) {
      return fallback(429, "Slow down a little.");
    }
    const { program } = await resolveDiscoveryAccess(caller.svc, caller.userId);
    return await suggestCore(publicSupabase, parsed.data, program);
  } catch (error) {
    logger.error("suggestDiscovery failed", error);
    return fallback(500, "Suggestions are unavailable right now.");
  }
}
