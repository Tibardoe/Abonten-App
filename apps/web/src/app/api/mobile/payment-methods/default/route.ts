import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { setDefaultPaymentMethodCore } from "@abonten/services/payments/paymentMethodCore";

// POST /api/mobile/payment-methods/default  { paymentMethodId: string }
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      paymentMethodId?: unknown;
    } | null;

    if (
      typeof body?.paymentMethodId !== "string" ||
      body.paymentMethodId.length === 0
    ) {
      return apiJson({
        status: 400,
        message: tr("paymentmethodidIsRequired"),
      });
    }

    const result = await setDefaultPaymentMethodCore(
      auth.supabase,
      auth.user.id,
      body.paymentMethodId,
    );
    return apiJson(result);
  } catch (error) {
    logger.error("mobile POST /payment-methods/default failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
