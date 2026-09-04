import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";

// Thin wrapper around the DB-backed rate-limit primitive (migration
// 20260907094200_rate_limit_primitive.sql — consume_rate_limit RPC,
// service_role only). Use this for write/proxy endpoints that have no
// natural domain-table row to run a COUNT query against, or where the
// abuse signal is *attempts* rather than successes (this codebase's other
// rate caps — submitReportCore, requestPhoneVerification — count real rows
// in their own table instead, which is fine to keep doing where it already
// works; this helper is for the cases that pattern doesn't cover).
//
// Fails OPEN on an infrastructure error (can't reach the DB, RPC missing,
// etc.): a broken limiter should never be the reason a legitimate request
// is blocked. The failure is logged so it's visible in Monitoring.

/**
 * Returns true if `key` is still within `limit` calls per `windowSeconds`
 * (a fixed window, not sliding), false if the caller should be told to
 * slow down. `key` should already be scoped to what you're limiting, e.g.
 * `geocode:${ip}` or `promo-lookup:${userId}`.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      logger.error(`checkRateLimit: RPC failed for "${key}": ${error.message}`);
      return true;
    }

    return data === true;
  } catch (error) {
    logger.error(`checkRateLimit: unexpected error for "${key}": ${error}`);
    return true;
  }
}
