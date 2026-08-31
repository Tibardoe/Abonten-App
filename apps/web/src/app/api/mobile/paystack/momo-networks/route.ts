import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { listMobileMoneyProviders } from "@/services/paystackService";
import { logger } from "@abonten/core/logger";

// GET /api/mobile/paystack/momo-networks
// Live list of Ghana mobile money networks Paystack supports — feeds the
// network picker on the "add mobile money" screen. Same source as the web
// getPaystackMobileMoneyNetworks action.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const banks = await listMobileMoneyProviders();
    return apiJson({
      status: 200,
      data: banks.map((bank) => ({ code: bank.code, name: bank.name })),
    });
  } catch (error) {
    logger.error("mobile GET /paystack/momo-networks failed", error);
    return apiJson({
      status: 500,
      message: "Couldn't load mobile money networks",
    });
  }
}
