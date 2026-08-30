"use client";

import getServiceFeeRate from "@/actions/getServiceFeeRate";
import { DEFAULT_SERVICE_FEE_RATE } from "@/utils/checkoutPricing";
import { useQuery } from "@tanstack/react-query";

// The customer-paid Abonten service-fee rate for checkout live previews
// (CheckoutModal, PendingCheckoutsBasket). The authoritative charged amount
// is still computed server-side from the same platform_fee_config row, so a
// brief wrong preview before this resolves only ever means the shown fee
// updates once — it can't make the buyer be charged a different amount than
// they approved. Long staleTime: the rate changes at most a handful of times
// in the product's life.
export function useServiceFeeRate(currency?: string) {
  const { data } = useQuery({
    queryKey: ["service-fee-rate", currency ?? null],
    queryFn: async () => {
      const result = await getServiceFeeRate(currency ?? null);
      return result.data;
    },
    staleTime: 60 * 60 * 1000,
  });

  return data ?? DEFAULT_SERVICE_FEE_RATE;
}
