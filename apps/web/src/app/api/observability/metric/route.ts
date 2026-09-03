import { logger } from "@abonten/core/logger";
import {
  type RequestMetricInput,
  ingestMetricCore,
} from "@abonten/services/admin/observability/observabilityCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { NextResponse } from "next/server";

// POST /api/observability/metric — sampled request-timing beacon. Requires
// the shared secret (only server middleware / trusted callers post here).
export async function POST(req: Request) {
  const secret = process.env.OBSERVABILITY_INGEST_SECRET;
  if (!secret || req.headers.get("x-observability-secret") !== secret) {
    return NextResponse.json({ status: 401 }, { status: 401 });
  }

  const body = (await req
    .json()
    .catch(() => null)) as Partial<RequestMetricInput> | null;
  if (!body || typeof body.platform !== "string") {
    return NextResponse.json({ status: 400 }, { status: 400 });
  }

  try {
    const res = await ingestMetricCore(getSupabaseServiceClient(), {
      platform: body.platform as RequestMetricInput["platform"],
      route: body.route ?? null,
      method: body.method ?? null,
      statusCode: typeof body.statusCode === "number" ? body.statusCode : null,
      durationMs: typeof body.durationMs === "number" ? body.durationMs : null,
      ok: body.ok ?? true,
    });
    return NextResponse.json({ status: res.status }, { status: res.status });
  } catch (e) {
    logger.error("observability/metric ingest failed", e);
    return NextResponse.json({ status: 500 }, { status: 500 });
  }
}
