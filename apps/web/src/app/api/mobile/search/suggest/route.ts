import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { resolveDiscoveryAccess } from "@abonten/services/search/discoveryProgram";
import { suggestCore } from "@abonten/services/search/searchCore";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import { searchSuggestSchema } from "@abonten/validation/discoverySchemas";

// GET /api/mobile/search/suggest?q=&lat=&lng=
// Type-ahead suggestions. Signed-out use is allowed; rate-limited per user or
// per IP at the same 180 a minute as the web suggestDiscovery Server Action,
// with the programme's switches and the same identity-free logging. Older
// app builds still call the search_suggest RPC directly until they update.
export async function GET(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: searchSuggestSchema,
      label: "GET /search/suggest",
      allowAnonymous: true,
    },
    async ({ svc, userId, data, ip, platform }) => {
      const key = userId
        ? `search-suggest:user:${userId}`
        : `search-suggest:ip:${ip}`;
      if (!(await checkRateLimit(key, 180, 60))) {
        return { status: 429, message: "Slow down a little." };
      }
      const { program, settings } = await resolveDiscoveryAccess(svc, userId);
      return suggestCore(svc, data, program, {
        platform,
        loggingEnabled: settings?.search_logging_enabled ?? false,
      });
    },
  );
}
