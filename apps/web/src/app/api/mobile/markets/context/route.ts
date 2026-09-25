import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getMarketContextCore } from "@abonten/services/markets/marketContextCore";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import type { Database } from "@abonten/types/database.types";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";

// GET /api/mobile/markets/context?lat=5.6&lng=-0.19&platform=ios&appVersion=1.4.0&installId=…
// (or ?country=GH when the browsing country is already known)
//
// Everything the app needs to feel local, in one call: the open markets,
// the resolved locale context (market, display currency, unit, zone), the
// display-rate table for price estimates and the feature flags that apply.
// Works signed out (the default market + request country); a Bearer token,
// when present, adds the person's saved preferences and cohorts.
const MARKET_CONTEXT_POINT_LOOKUPS_PER_MINUTE = 30;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const platform =
      url.searchParams.get("platform") === "android" ? "android" : "ios";
    const browsingCountry = url.searchParams.get("country");
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    let browsingPoint =
      url.searchParams.has("lat") &&
      url.searchParams.has("lng") &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
        ? { lat, lng }
        : null;
    const appVersion = url.searchParams.get("appVersion");
    const installId = url.searchParams.get("installId");
    const viewerTimeZone = url.searchParams.get("tz");
    const viewerLocale = url.searchParams.get("locale");
    const requestCountry =
      req.headers.get("x-vercel-ip-country") ??
      req.headers.get("x-country-code");

    let userId: string | null = null;
    let supabase: SupabaseClient<Database> | null = null;
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    if (token) {
      const client = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
        {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false },
        },
      );
      const { data } = await client.auth.getUser(token);
      if (data.user) {
        userId = data.user.id;
        supabase = client;
      }
    }

    // A new point can cost a billed Google reverse-geocode call and this
    // route answers signed-out callers, so point lookups are rate limited
    // per account (or per address when signed out). Over the limit the
    // point is ignored and the request country / saved area decide instead.
    if (browsingPoint) {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "unknown";
      const allowed = await checkRateLimit(
        userId ? `market-context:${userId}` : `market-context-ip:${ip}`,
        MARKET_CONTEXT_POINT_LOOKUPS_PER_MINUTE,
        60,
      );
      if (!allowed) browsingPoint = null;
    }

    const result = await getMarketContextCore({
      supabase,
      userId,
      browsingCountry,
      browsingPoint,
      requestCountry,
      viewerTimeZone,
      viewerLocale,
      platform,
      appVersion,
      installId,
    });
    return apiJson({ status: 200, data: result });
  } catch (error) {
    logger.error("mobile GET /markets/context failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
