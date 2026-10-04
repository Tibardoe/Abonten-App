import { createClient } from "@/config/supabase/server";
import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";
import { logger } from "@abonten/core/logger";
import { googleMapsServerKey } from "@abonten/services/geo/googleMapsKey";
import { tr } from "@abonten/services/i18n/requestLocale";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import { NextResponse } from "next/server";

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 20;

// Server-side proxy to Google's Geocoding API, used by the Field Ops lead
// territory form ("find this area on the map"). Google bills per request,
// so the route is signed-in only and rate limited per caller.
//
// It authenticates here rather than in the session proxy: an API route must
// answer 401 JSON, not a 307 to an HTML sign-in page, and the proxy only
// guards page sections (see PROTECTED_PREFIXES in
// src/config/supabase/middleware.ts).
export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: tr("notSignedIn") }, { status: 401 });
    }

    // DB-backed (limitation OBS-001): the previous in-memory counter reset
    // on every cold start and didn't share state across serverless
    // instances, making it close to a no-op under real traffic on this
    // billed Google Geocoding proxy. Keyed by account, which is the real
    // identity now that the route requires one.
    const allowed = await checkRateLimit(
      `geocode:${user.id}`,
      RATE_LIMIT_MAX_REQUESTS,
      RATE_LIMIT_WINDOW_SECONDS,
    );

    if (!allowed) {
      return NextResponse.json(
        { error: tr("tooManyRequestsPleaseTryAgain") },
        { status: 429 },
      );
    }

    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json(
        { error: tr("addressIsRequired") },
        { status: 400 },
      );
    }

    const apiKey = googleMapsServerKey();

    if (!apiKey) {
      logger.error("Geocode: GOOGLE_MAPS_API_KEY is not set");
      return NextResponse.json(
        { error: tr("locationLookupUnavailable") },
        { status: 500 },
      );
    }

    const res = await fetchWithTimeout(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address,
      )}&key=${apiKey}`,
      { timeoutMs: HTTP_TIMEOUTS.googleGeocode },
    );

    const data = await res.json();

    if (data.status === "OK") {
      const location = data.results[0].geometry.location;

      return NextResponse.json({ lat: location.lat, lng: location.lng });
    }

    return NextResponse.json(
      { error: data.status || tr("geocodingFailed") },
      { status: 500 },
    );
  } catch (error) {
    logger.error("Geocode error:", error);
    return NextResponse.json(
      { error: tr("somethingWentWrong") },
      { status: 500 },
    );
  }
}
