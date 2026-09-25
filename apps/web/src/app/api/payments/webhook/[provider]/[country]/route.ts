import { paymentFulfillmentDeps } from "@/utils/paymentFulfillmentDeps";
import { logger } from "@abonten/core/logger";
import { handleProviderWebhook } from "@abonten/services/payments/webhookCore";
import { NextResponse } from "next/server";

// POST /api/payments/webhook/{provider}/{country}
//
// One webhook endpoint per provider ACCOUNT: Paystack Nigeria posts to
// /api/payments/webhook/paystack/NG, Stripe UK to /api/payments/webhook/
// stripe/GB, and so on — each verified with that market's own webhook
// secret. (Ghana's original /api/paystack/webhook URL keeps working and
// delegates here.) The handler is the shared, provider-neutral core: it
// verifies the signature, normalises the event, records the delivery, and
// finalises payments through the same finalizePayment the client-side
// verify uses. See webhookCore.ts for the ack rules.
export async function POST(
  req: Request,
  context: { params: Promise<{ provider: string; country: string }> },
) {
  const { provider, country } = await context.params;
  try {
    const rawBody = await req.text();
    const result = await handleProviderWebhook({
      providerCode: provider,
      countryCode: country,
      rawBody,
      headers: req.headers,
      deps: paymentFulfillmentDeps,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    logger.error(`payments webhook ${provider}/${country} failed`, error);
    return NextResponse.json({ error: "Server error" }, { status: 503 });
  }
}
