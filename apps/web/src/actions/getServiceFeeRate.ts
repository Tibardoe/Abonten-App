"use server";

import { createClient } from "@/config/supabase/server";
import { getActiveServiceFeeRate } from "@/utils/platformFee";
import { DEFAULT_SERVICE_FEE_RATE } from "@abonten/core/checkoutPricing";

type GetServiceFeeRateResult = { status: 200; data: number };

/**
 * The active customer-paid Abonten service-fee rate (e.g. 0.05), read from
 * platform_fee_config. Powers the client-side checkout live preview
 * (useServiceFeeRate.ts) so what a buyer is shown matches what
 * createPaymentAttempt.ts / checkoutPaymentPreparation.ts will actually
 * charge. No auth check — the rate is shown to every buyer at checkout and
 * the config table is publicly readable. Always returns 200 with a usable
 * number (falls back to DEFAULT_SERVICE_FEE_RATE) so the preview never
 * breaks on a transient error.
 */
export default async function getServiceFeeRate(
  currency?: string | null,
): Promise<GetServiceFeeRateResult> {
  try {
    const supabase = await createClient();
    const rate = await getActiveServiceFeeRate(supabase, currency ?? null);
    return { status: 200, data: rate };
  } catch {
    return { status: 200, data: DEFAULT_SERVICE_FEE_RATE };
  }
}
