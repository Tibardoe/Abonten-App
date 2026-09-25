// Which payment methods a person can use right now: the market's enabled
// methods, on an enabled provider whose credentials are present, for the
// currency being paid, on this platform. The checkout and the wallet's
// "add" buttons ask this; the server refuses anything else.

import type {
  ClientPlatform,
  PaymentMethodCode,
} from "@abonten/core/market/types";
import { PAYMENT_METHOD_LABEL } from "@abonten/core/market/types";
import { getMarketOrDefault } from "../markets/marketConfig";
import { accountFromConfig, getPaymentProvider } from "./providers/registry";

export type AvailablePaymentMethod = {
  method: PaymentMethodCode;
  provider: string;
  label: string;
  recommended: boolean;
  /** The client can save an instrument of this kind for later (momo, card). */
  savable: boolean;
  /** "popup" | "redirect" | "direct" — how the client will continue. */
  flow: "popup" | "redirect" | "direct";
};

export async function listAvailablePaymentMethods(input: {
  countryCode: string | null | undefined;
  currency: string;
  platform: ClientPlatform;
}): Promise<{
  countryCode: string;
  currency: string;
  methods: AvailablePaymentMethod[];
}> {
  const market = await getMarketOrDefault(input.countryCode);
  const currency = input.currency.toUpperCase();
  const out: AvailablePaymentMethod[] = [];
  for (const pm of market.paymentMethods) {
    if (!pm.enabled) continue;
    if (!pm.currencies.map((c) => c.toUpperCase()).includes(currency)) continue;
    if (pm.platforms.length > 0 && !pm.platforms.includes(input.platform))
      continue;
    const providerConfig = market.paymentProviders.find(
      (p) => p.provider === pm.provider && p.enabled,
    );
    if (!providerConfig) continue;
    const account = accountFromConfig(market, providerConfig);
    if (!account) continue;
    const provider = getPaymentProvider(pm.provider);
    if (!provider.supportsMethod(account, pm.method, currency)) continue;
    const caps = provider.capabilities(account);
    out.push({
      method: pm.method,
      provider: pm.provider,
      label: pm.label ?? PAYMENT_METHOD_LABEL[pm.method],
      recommended: pm.recommended,
      savable:
        (pm.method === "card" && caps.savedCards) ||
        (pm.method === "mobile_money" && caps.directMobileMoney),
      flow:
        pm.method === "mobile_money" && caps.directMobileMoney
          ? "direct"
          : caps.checkoutModes.includes("popup")
            ? "popup"
            : "redirect",
    });
  }
  return { countryCode: market.countryCode, currency, methods: out };
}
