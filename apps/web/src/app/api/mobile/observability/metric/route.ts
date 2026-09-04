import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { ingestMetricCore } from "@abonten/services/admin/observability/observabilityCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";

// POST /api/mobile/observability/metric
//   { route, method, statusCode, durationMs, ok }
//
// Sampled request-timing beacon from the native app's HTTP client
// (@abonten/api-client, ~10% of calls). Bearer-authed rather than
// secret-gated — the shared OBSERVABILITY_INGEST_SECRET can't live in a
// mobile bundle. The identity isn't stored; we only need a valid session
// to keep the endpoint from being open. Always answers 202 so a rejected
// beacon never shows up as a client error.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  const body = (await req.json().catch(() => null)) as {
    route?: unknown;
    method?: unknown;
    statusCode?: unknown;
    durationMs?: unknown;
    ok?: unknown;
  } | null;
  if (!body) return apiJson({ status: 202 });

  try {
    await ingestMetricCore(getSupabaseServiceClient(), {
      platform: "mobile",
      route: typeof body.route === "string" ? body.route.slice(0, 200) : null,
      method: typeof body.method === "string" ? body.method : null,
      statusCode: typeof body.statusCode === "number" ? body.statusCode : null,
      durationMs:
        typeof body.durationMs === "number" && body.durationMs >= 0
          ? Math.round(body.durationMs)
          : null,
      ok: body.ok !== false,
    });
  } catch (error) {
    logger.error("mobile POST /observability/metric failed", error);
  }
  return apiJson({ status: 202 });
}
