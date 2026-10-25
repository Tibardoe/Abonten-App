import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { paymentChoiceFromBody } from "@/app/api/mobile/_lib/paymentChoiceBody";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { payTicketPlanPartCore } from "@abonten/services/ticketPlans/ticketPlanCore";
import { payTicketPlanPartSchema } from "@abonten/validation/ticketPlanSchemas";

// POST /api/mobile/ticket-plans/:planId/pay
//   { amountMinor: number, paymentMethodId?: string, method?: string }
// Starts the charge for one part (the same payTicketPlanPartCore the web
// action runs). The answer has the attempt id and the provider's payment
// (`mode` direct / popup / redirect), exactly like /checkout/attempt, so the
// app's payment screen confirms it through /payments/verify. The provider's
// callback is an `abonten://` deep link back to the plan.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { planId } = await params;
    const body = (await req.json().catch(() => null)) as {
      amountMinor?: unknown;
      paymentMethodId?: unknown;
      method?: unknown;
    } | null;
    const choice = paymentChoiceFromBody(req, body);
    if (!choice.paymentMethodId && !choice.method) {
      return apiJson({
        status: 400,
        message: tr("paymentmethodidOrMethodIsRequired"),
      });
    }
    const parsed = payTicketPlanPartSchema.safeParse({
      planId,
      amountMinor: body?.amountMinor,
      ...choice,
    });
    if (!parsed.success) {
      return apiJson({
        status: 400,
        message: parsed.error.issues[0]?.message ?? tr("enterAnAmountToPay"),
      });
    }
    return apiJson(
      await payTicketPlanPartCore(
        auth.supabase,
        auth.user.id,
        auth.user.email,
        parsed.data,
        (id) => `abonten://ticket-plans/${id}`,
      ),
    );
  } catch (error) {
    logger.error("mobile POST /ticket-plans/:planId/pay failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
