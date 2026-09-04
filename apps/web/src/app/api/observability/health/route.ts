import { logger } from "@abonten/core/logger";
import { runHealthChecksCore } from "@abonten/services/admin/observability/runHealthChecksCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { NextResponse } from "next/server";

// GET /api/observability/health
//
// Runs real dependency probes and writes one health_check_result row per
// check. Hit by the `abonten-health-check` pg_cron job every 2 minutes
// with the shared secret in the `x-observability-secret` header (the
// `?secret=` query param is still accepted for a manual curl, but the cron
// uses the header — query-string secrets leak into access logs). Also
// serves as a plain liveness endpoint.
//
// The pg_cron side (run_scheduled_health_check) records its own
// `check_key='self'` row from the HTTP status it gets back, so a rejected
// or unreachable call still shows up on the Admin Monitor instead of
// leaving it blank.
export async function GET(req: Request) {
  const secret = process.env.OBSERVABILITY_INGEST_SECRET;
  const url = new URL(req.url);
  const provided =
    req.headers.get("x-observability-secret") ?? url.searchParams.get("secret");
  if (!secret || provided !== secret) {
    // Log the reason (never the value) so a 401 is diagnosable from the
    // Vercel logs — the usual cause is OBSERVABILITY_INGEST_SECRET not
    // being set on this deployment, or not matching observability_config.
    logger.warn(
      `observability/health: rejected — ${
        !secret
          ? "OBSERVABILITY_INGEST_SECRET is not set on this deployment"
          : "provided secret does not match OBSERVABILITY_INGEST_SECRET"
      }`,
    );
    return NextResponse.json({ status: 401 }, { status: 401 });
  }

  try {
    const { status, results } = await runHealthChecksCore(
      getSupabaseServiceClient(),
      {
        paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
        resendApiKey: process.env.RESEND_API_KEY,
        cloudinaryCloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
        cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
        cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
        hubtelClientId: process.env.HUBTEL_API_CLIENT_ID,
        hubtelClientSecret: process.env.HUBTEL_API_CLIENT_SECRET,
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
