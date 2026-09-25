"use server";

import { listMobileMoneyNetworksCore } from "@abonten/services/payments/mobileMoneyNetworksCore";

export type MobileMoneyNetworkOption = {
  code: string;
  name: string;
};

type GetMobileMoneyNetworksResult =
  | { status: 404 | 500; message: string }
  | {
      status: 200;
      data: MobileMoneyNetworkOption[];
      countryCode: string;
      currency: string;
    };

/**
 * Live list of the mobile money networks the market's provider supports —
 * feeds the network dropdown in AddMomoWallet.tsx and the payout form.
 * `countryCode` is the market the wallet is for (the person's home market
 * by default); the server refuses markets without mobile money. Safe to
 * call unauthenticated (no user-specific data).
 */
export default async function getPaystackMobileMoneyNetworks(
  countryCode?: string | null,
): Promise<GetMobileMoneyNetworksResult> {
  const result = await listMobileMoneyNetworksCore(countryCode ?? null);
  if (result.status !== 200) return result;
  return {
    status: 200,
    data: result.data.networks,
    countryCode: result.data.countryCode,
    currency: result.data.currency,
  };
}
