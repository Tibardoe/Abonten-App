import { safetyDeps } from "@/utils/sendSafetyEmail";
import { logger } from "@abonten/core/logger";
import { isDeliveryTokenValid } from "@abonten/services/notifications/deliveryCore";
import { runSafetyDispatchCore } from "@abonten/services/safety/safetyDispatchCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { NextResponse } from "next/server";

export const maxDuration = 60;

// POST /api/safety/dispatch
//
// Abonten Safety's minute job: missed check-ins become alerts, check-ins
// whose time has come get one "time to check in" push, and texts, emails
// and pushes due a (re)try are sent. Called once a minute by the
// `safety-dispatch` pg_cron job (run_safety_dispatch), only while something
// is due, with the notification-delivery token in `x-delivery-token`. The
// work is claimed with row locks in the database, so an overlapping or
// repeated call cannot alert or text anyone twice.
export async function POST(req: Request) {
  if (!(await isDeliveryTokenValid(req.headers.get("x-delivery-token")))) {
    logger.warn("safety/dispatch: rejected -- missing or wrong token");
    return NextResponse.json({ status: 401 }, { status: 401 });
  }
  const res = await runSafetyDispatchCore(
    getSupabaseServiceClient(),
    safetyDeps,
  );
  return NextResponse.json(res, { status: res.status });
}
