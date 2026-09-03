import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import type { ErrorEventPayload } from "@abonten/core/reportError";
import { ingestErrorCore } from "@abonten/services/admin/observability/observabilityCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { NextResponse } from "next/server";

// POST /api/observability/error
//
// Accepts a normalized ErrorEventPayload (from packages/core/reportError)
// and persists it via the service-role client. Auth is intentionally light
// — an error report is low-value to forge and high-value to not lose — but
// we still require ONE of:
//   * the shared OBSERVABILITY_INGEST_SECRET header (server-to-server), or
//   * a valid Supabase session (browser) — cookie OR bearer.
// Unauthenticated callers are dropped.
export async function POST(req: Request) {
  const secret = process.env.OBSERVABILITY_INGEST_SECRET;
  const provided = req.headers.get("x-observability-secret");
  let authed = !!secret && provided === secret;
  let userId: string | null = null;

  if (!authed) {
    // cookie session?
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        authed = true;
        userId = user.id;
      }
    } catch {
      /* ignore */
    }
  }
  if (!authed && req.headers.get("authorization")) {
    const bearer = await getMobileAuth(req);
    if (!bearer.response) {
      authed = true;
      userId = bearer.user.id;
    }
  }

  if (!authed) {
    return NextResponse.json({ status: 401 }, { status: 401 });
  }

  const body = (await req
    .json()
    .catch(() => null)) as Partial<ErrorEventPayload> | null;
  if (
    !body ||
    typeof body.fingerprint !== "string" ||
    typeof body.platform !== "string"
  ) {
    return NextResponse.json(
      { status: 400, message: "Invalid payload" },
      { status: 400 },
    );
  }

  const payload: ErrorEventPayload = {
    fingerprint: body.fingerprint,
    errorType: body.errorType ?? "Error",
    message: (body.message ?? "").slice(0, 2000),
    stack: body.stack ? body.stack.slice(0, 8000) : null,
    platform: body.platform as ErrorEventPayload["platform"],
    route: body.route ?? null,
    appVersion: body.appVersion ?? null,
    release: body.release ?? null,
    severity: (body.severity as ErrorEventPayload["severity"]) ?? "error",
    userId: body.userId ?? userId,
    context: body.context ?? null,
    occurredAt: body.occurredAt ?? new Date().toISOString(),
  };

  try {
    const res = await ingestErrorCore(getSupabaseServiceClient(), payload);
    return NextResponse.json({ status: res.status }, { status: res.status });
  } catch (e) {
    logger.error("observability/error ingest failed", e);
    return NextResponse.json({ status: 500 }, { status: 500 });
  }
}
