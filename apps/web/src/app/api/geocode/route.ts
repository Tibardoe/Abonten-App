import { logger } from "@abonten/core/logger";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import { NextResponse } from "next/server";

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 20;

export async function GET(req: Request) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    // DB-backed (limitation OBS-001): the previous in-memory counter reset
    // on every cold start and didn't share state across serverless
    // instances, making it close to a no-op under real traffic on this
    // billed Google Geocoding proxy. This is unauthenticated by design
    // (used before login), so IP is the only identity available.
    const allowed = await checkRateLimit(
      `geocode:${ip}`,
      RATE_LIMIT_MAX_REQUESTS,
      RATE_LIMIT_WINDOW_SECONDS,
    );

    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 },
      );
    }

    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 },
      );
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing Google Maps API Key" },
        { status: 500 },
      );
    }

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address,
      )}&key=${apiKey}`,
    );

    const data = await res.json();

    if (data.status === "OK") {
      const location = data.results[0].geometry.location;

      return NextResponse.json({ lat: location.lat, lng: location.lng });
    }

    return NextResponse.json(
      { error: data.status || "Geocoding failed" },
      { status: 500 },
    );
  } catch (error) {
    logger.error("Geocode error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
