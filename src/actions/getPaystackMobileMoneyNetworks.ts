"use server";

import { listMobileMoneyProviders } from "@/services/paystackService";

export type MobileMoneyNetworkOption = {
  code: string;
  name: string;
};

type GetPaystackMobileMoneyNetworksResult =
  | { status: 500; message: string }
  | { status: 200; data: MobileMoneyNetworkOption[] };

/**
 * Live list of Ghana mobile money networks Paystack currently supports,
 * instead of a hardcoded guess — feeds the network dropdown in
 * AddMomoWallet.tsx. Safe to call unauthenticated (no user-specific data);
 * the client caches this with a long staleTime since it rarely changes.
 */
export default async function getPaystackMobileMoneyNetworks(): Promise<GetPaystackMobileMoneyNetworksResult> {
  try {
    const banks = await listMobileMoneyProviders();

    return {
      status: 200,
      data: banks.map((bank) => ({ code: bank.code, name: bank.name })),
    };
  } catch (error) {
    console.log(`Failed listing Paystack mobile money providers: ${error}`);
    return { status: 500, message: "Couldn't load mobile money networks" };
  }
}
