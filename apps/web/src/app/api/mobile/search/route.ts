import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { resolveDiscoveryAccess } from "@abonten/services/search/discoveryProgram";
import { searchCore } from "@abonten/services/search/searchCore";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import { searchRequestSchema } from "@abonten/validation/discoverySchemas";

// GET /api/mobile/search?q=&mode=all|events|places|organizers&cursor=&lat=&lng=...
// Submitted searches (type-ahead suggestions call the search_suggest RPC
// directly). Signed-out use is allowed; rate-limited per user or per IP.
// Same service as the web searchDiscovery Server Action.
export async function GET(req: Request) {
  return discoveryRoute(
    req,
    { schema: searchRequestSchema, label: "GET /search", allowAnonymous: true },
    async ({ svc, userId, data, ip, platform }) => {
      const key = userId ? `search:user:${userId}` : `search:ip:${ip}`;
      if (!(await checkRateLimit(key, 60, 60))) {
        return {
          status: 429,
          message: "You are searching very quickly. Try again in a moment.",
        };
      }
      const { program, settings } = await resolveDiscoveryAccess(svc, userId);
      return searchCore(svc, data, {
        program,
        platform,
        log: !data.cursor,
        loggingEnabled: settings?.search_logging_enabled ?? false,
      });
    },
  );
}
