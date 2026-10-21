import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import {
  type RequestMobileMoneyCodeInput,
  requestMobileMoneyNumberCodeCore,
} from "@abonten/services/payments/mobileMoneyNumberCheck";

// POST /api/mobile/payment-methods/momo-code
//   { phone, use: "wallet" | "payout", countryCode? }
// First step of saving a mobile money wallet or payout account: texts a code
// to the number unless it is the caller's own verified phone. Same core as
// the web requestMobileMoneyNumberCode Server Action.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req
      .json()
      .catch(() => null)) as Partial<RequestMobileMoneyCodeInput> | null;
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    const result = await requestMobileMoneyNumberCodeCore(
      auth.supabase,
      auth.user.id,
      {
        phone: typeof body?.phone === "string" ? body.phone : "",
        use: body?.use === "payout" ? "payout" : "wallet",
        countryCode:
          typeof body?.countryCode === "string" ? body.countryCode : null,
      },
      ip,
    );
    return apiJson(result);
  } catch (error) {
    logger.error("mobile POST /payment-methods/momo-code failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
