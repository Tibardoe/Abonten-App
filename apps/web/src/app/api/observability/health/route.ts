import { logger } from "@abonten/core/logger";
import { runHealthChecksCore } from "@abonten/services/admin/observability/runHealthChecksCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { NextResponse } from "next/server";

// GET /api/observability/health
//
// Runs real dependency probes and writes one health_check_result row per
// check. Hit by a pg_cron job every 1-2 minutes with the shared secret
// (?secret= or the x-observability-secret header). Also serves as a plain
// liveness endpoint.
export async function GET(req: Request) {
  const secret = process.env.OBSERVABILITY_INGEST_SECRET;
  const url = new URL(req.url);
  const provided =
    req.headers.get("x-observability-secret") ?? url.searchParams.get("secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ status: 401 }, { status: 401 });
  }

  try {
    const { status, results } = await runHealthChecksCore(
      getSupabaseServiceClient(),
      {
        paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
        resendApiKey: process.env.RESEND_API_KEY,
        cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
        cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
        cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
        hubtelClientId: process.env.HUBTEL_CLIENT_ID,
        hubtelClientSecret: process.env.HUBTEL_CLIENT_SECRET,
        expoAccessToken: process.env.EXPO_ACCESS_TOKEN,
      },
    );
    return NextResponse.json(
      { status, results },
      { status: status === 200 ? 200 : 207 },
    );
  } catch (e) {
    logger.error("observability/health run failed", e);
    return NextResponse.json({ status: 500 }, { status: 500 });
  }
}
