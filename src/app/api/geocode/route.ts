import { logger } from "@/utils/logger";
import { NextResponse } from "next/server";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;
// Basic in-memory per-IP rate limit so this billed Google Geocoding proxy
// can't be hit unbounded — this is unauthenticated by design (used before
// login), so IP is the only identity available. Resets on cold start and
// doesn't share state across instances/replicas — a first line of defense,
// not a distributed guarantee.
const requestTimestampsByIp = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (requestTimestampsByIp.get(ip) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestTimestampsByIp.set(ip, recent);
    return true;
  }

  recent.push(now);
  requestTimestampsByIp.set(ip, recent);
  return false;
}

export async function GET(req: Request) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    if (isRateLimited(ip)) {
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
