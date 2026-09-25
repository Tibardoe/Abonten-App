import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { listMobileMoneyNetworksCore } from "@abonten/services/payments/mobileMoneyNetworksCore";

// GET /api/mobile/payments/momo-networks?country=GH
// Live list of the mobile money networks the market's provider supports —
// feeds the network picker on the "add mobile money" screen. Same source as
// the web getPaystackMobileMoneyNetworks action. Without `country` the
// signed-in person's home market applies.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const url = new URL(req.url);
    let country = url.searchParams.get("country");
    if (!country) {
      const { data } = await auth.supabase
        .from("user_info")
        .select("country_code")
        .eq("id", auth.user.id)
        .maybeSingle();
      country = data?.country_code ?? null;
    }
    const result = await listMobileMoneyNetworksCore(country);
    if (result.status !== 200) return apiJson(result);
    // The body stays the plain network list the app already reads; the
    // market it came from travels in headers for debugging.
    const res = apiJson({ status: 200, data: result.data.networks });
    res.headers.set("x-abonten-market", result.data.countryCode);
    res.headers.set("x-abonten-currency", result.data.currency);
    return res;
  } catch (error) {
    logger.error("mobile GET /payments/momo-networks failed", error);
    return apiJson({
      status: 500,
      message: "Couldn't load mobile money networks",
    });
  }
}
