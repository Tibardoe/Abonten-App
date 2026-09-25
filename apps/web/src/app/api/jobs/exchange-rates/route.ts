import { logger } from "@abonten/core/logger";
import {
  isRefreshTokenValid,
  refreshExchangeRates,
} from "@abonten/services/fx/exchangeRateCore";
import { NextResponse } from "next/server";

// POST /api/jobs/exchange-rates
//
// Called by the pg_cron job `exchange-rates-refresh` (run_exchange_rate_
// refresh) with the token from exchange_rate_config in `x-refresh-token`,
// the same pattern as notification delivery. Fetches the latest display
// rates from the configured provider. Never reachable without the token.
export async function POST(req: Request) {
  if (!(await isRefreshTokenValid(req.headers.get("x-refresh-token")))) {
    logger.warn("jobs/exchange-rates: rejected -- missing or wrong token");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await refreshExchangeRates();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
