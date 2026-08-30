// The customer-paid Abonten service-fee rate, resolved from the
// platform_fee_config DB table via the get_active_platform_fee_rate RPC —
// the single source of truth, editable without a code deploy. Shared by the
// server-side checkout charge paths (createPaymentAttempt.ts,
// checkoutPaymentPreparation.ts) and, through getServiceFeeRate.ts, the
// client-side live preview. Not a "use server" file — same category as
// ticketInventory.ts/promoUsage.ts: it takes an already-constructed Supabase
// client rather than resolving a session of its own.

import { DEFAULT_SERVICE_FEE_RATE } from "@abonten/core/checkoutPricing";
import { logger } from "@abonten/core/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns the active service-fee rate (e.g. 0.05) for the given currency,
 * falling back to DEFAULT_SERVICE_FEE_RATE if the config can't be read — so
 * a transient DB hiccup never silently charges a 0% fee.
 */
export async function getActiveServiceFeeRate(
  supabase: SupabaseClient,
  currency?: string | null,
): Promise<number> {
  const { data, error } = await supabase.rpc("get_active_platform_fee_rate", {
    p_currency: currency ?? null,
  });

  if (error || data == null) {
    if (error) {
      logger.error(`Failed reading platform fee rate: ${error.message}`);
    }
    return DEFAULT_SERVICE_FEE_RATE;
  }

  const rate = Number(data);
  return Number.isFinite(rate) && rate >= 0 && rate < 1
    ? rate
    : DEFAULT_SERVICE_FEE_RATE;
}
