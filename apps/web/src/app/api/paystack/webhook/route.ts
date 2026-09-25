import { paymentFulfillmentDeps } from "@/utils/paymentFulfillmentDeps";
import { logger } from "@abonten/core/logger";
import { getDefaultMarket } from "@abonten/services/markets/marketConfig";
import { handleProviderWebhook } from "@abonten/services/payments/webhookCore";
import { NextResponse } from "next/server";

// POST /api/paystack/webhook — the URL registered on the first (Ghana)
// Paystack business. It is the default market's Paystack account, handled
// by the same provider-neutral core as /api/payments/webhook/{provider}/
// {country}; every other market registers its own URL there.
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const market = await getDefaultMarket();
    const result = await handleProviderWebhook({
      providerCode: "paystack",
      countryCode: market.countryCode,
      rawBody,
      headers: req.headers,
      deps: paymentFulfillmentDeps,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    logger.error("Paystack webhook failed", error);
    return NextResponse.json({ error: "Server error" }, { status: 503 });
  }
}
