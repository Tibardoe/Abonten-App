import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import {
  addPaymentMethodCore,
  listPaymentMethodsCore,
} from "@/utils/paymentMethodCore";
import { logger } from "@abonten/core/logger";
import type { AddPaymentMethodInput } from "@abonten/validation/paymentMethodSchema";

// GET  /api/mobile/payment-methods         -> the caller's active methods
// POST /api/mobile/payment-methods  { ...AddPaymentMethodInput }
//   The app only builds `momo` wallets (network + phone). A `card` is
//   accepted by the shared schema but requires a server-captured
//   authorization code the app has no flow for, so it is rejected here.

export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const result = await listPaymentMethodsCore(auth.supabase, auth.user.id);
    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /payment-methods failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}

export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as
      | (Partial<AddPaymentMethodInput> & { type?: string })
      | null;

    if (body?.type !== "momo") {
      return apiJson({
        status: 400,
        message: "Only mobile money wallets can be added from the app.",
      });
    }

    const result = await addPaymentMethodCore(
      auth.supabase,
      auth.user.id,
      body as AddPaymentMethodInput,
    );
    return apiJson(result);
  } catch (error) {
    logger.error("mobile POST /payment-methods failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
