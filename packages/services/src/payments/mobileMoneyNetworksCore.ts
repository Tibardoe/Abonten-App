import { logger } from "@abonten/core/logger";
import { getMarketOrDefault } from "../markets/marketConfig";
import { NoProviderError, resolveProviderAccount } from "./providers/registry";
import type { MobileMoneyNetwork } from "./providers/types";

// The live list of mobile money networks a market's provider supports —
// feeds the "select your network" picker on the add-wallet and payout
// screens. Country-aware: a Kenyan gets M-Pesa, a Ghanaian MTN/Telecel/AT.
// Safe to call without a session (no personal data).

export type MobileMoneyNetworksResult =
  | { status: 404 | 500; message: string }
  | {
      status: 200;
      data: {
        countryCode: string;
        currency: string;
        networks: MobileMoneyNetwork[];
      };
    };

export async function listMobileMoneyNetworksCore(
  countryCode: string | null | undefined,
): Promise<MobileMoneyNetworksResult> {
  const market = await getMarketOrDefault(countryCode);
  const offered = market.paymentMethods.some(
    (m) => m.enabled && m.method === "mobile_money",
  );
  if (!offered) {
    return {
      status: 404,
      message: "Mobile money isn't available in this market.",
    };
  }
  try {
    const { provider, account } = await resolveProviderAccount({
      countryCode: market.countryCode,
      currency: market.defaultCurrency,
      method: "mobile_money",
    });
    const networks = await provider.listMobileMoneyNetworks(
      account,
      market.defaultCurrency,
    );
    return {
      status: 200,
      data: {
        countryCode: market.countryCode,
        currency: market.defaultCurrency,
        networks,
      },
    };
  } catch (error) {
    if (error instanceof NoProviderError) {
      return {
        status: 404,
        message: "Mobile money isn't available in this market.",
      };
    }
    logger.error(`Failed listing mobile money networks: ${error}`);
    return { status: 500, message: "Couldn't load mobile money networks" };
  }
}
