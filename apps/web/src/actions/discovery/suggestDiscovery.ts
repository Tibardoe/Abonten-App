"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requestIp,
  resolveDiscoveryCaller,
} from "@/utils/discoveryAction";
import { logger } from "@abonten/core/logger";
import { parseSearchQuery } from "@abonten/core/search/parseSearchQuery";
import { tr } from "@abonten/services/i18n/requestLocale";
import { resolveDiscoveryAccess } from "@abonten/services/search/discoveryProgram";
import { suggestCore } from "@abonten/services/search/searchCore";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import type { SearchSuggestionsResponse } from "@abonten/types/searchType";
import { searchSuggestSchema } from "@abonten/validation/discoverySchemas";

function fallback(status: number, message: string): SearchSuggestionsResponse {
  return {
    status,
    message,
    searchId: null,
    query: parseSearchQuery(""),
    events: [],
    places: [],
    organizers: [],
  };
}

/** Type-ahead suggestions for the search bar (events, places, organizers, "@" mode). */
export const suggestDiscovery = withActionLocale(
  async function suggestDiscovery(
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
        return fallback(429, tr("slowDownALittle"));
      }
      const { program, settings } = await resolveDiscoveryAccess(
        caller.svc,
        caller.userId,
      );
      return await suggestCore(publicSupabase, parsed.data, program, {
        platform: "web",
        loggingEnabled: settings?.search_logging_enabled ?? false,
      });
    } catch (error) {
      logger.error("suggestDiscovery failed", error);
      return fallback(500, tr("suggestionsAreUnavailableRightNow"));
    }
  },
);
