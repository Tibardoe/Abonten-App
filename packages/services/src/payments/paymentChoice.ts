// How a buyer chose to pay, checked against what the order's market can
// actually complete. Shared by every checkout (tickets, promotions,
// Spotlight campaigns) on both transports, so the rules have one home:
//
//   * The market must be taking payments (`live`); a paused market or one
//     in maintenance sells nothing, whatever the client shows.
//   * A method is only accepted when the market has it enabled, on an
//     enabled provider with credentials, for the order's currency and the
//     caller's platform, and any `checkout.<provider>` flag lets this buyer
//     in (listAvailablePaymentMethods). The client's list is a convenience;
//     this is the check.
//   * A buyer can pay two ways: with a SAVED instrument (a card token or a
//     mobile-money wallet), or with a METHOD on the provider's own page
//     (card, bank transfer, USSD, Apple Pay…). A saved card is charged
//     directly only when it was tokenised by the same provider account (a
//     Paystack Ghana token means nothing to Paystack Nigeria); otherwise the
//     card goes through the hosted page. A wallet must be a number in the
//     market's own country.

import { logger } from "@abonten/core/logger";
import type {
  ClientPlatform,
  PaymentMethodCode,
} from "@abonten/core/market/types";
import { isMarketTransacting } from "@abonten/core/market/types";
import { phoneCountry } from "@abonten/core/phone/phone";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDefaultMarket, getMarketOrDefault } from "../markets/marketConfig";
import type { SelectedPaymentMethod } from "./chargeInit";
import {
  type AvailablePaymentMethod,
  listAvailablePaymentMethods,
} from "./paymentMethodAvailability";

export type PaymentChoiceInput = {
  /** A saved instrument from the buyer's wallet. */
  paymentMethodId?: string | null;
  /** Or a method paid on the provider's page (`card`, `bank_transfer`…). */
  method?: string | null;
  platform?: ClientPlatform | null;
};

export type ResolvedPaymentChoice = {
  methodCode: PaymentMethodCode;
  providerCode: string;
  /** Only set when the instrument can be charged directly by this account. */
  saved: SelectedPaymentMethod | null;
  /** The wallet row the buyer picked, kept on the attempt for the record. */
  paymentMethodId: string | null;
  offer: AvailablePaymentMethod;
};

export type PaymentChoiceResult =
  | { ok: true; choice: ResolvedPaymentChoice }
  | { ok: false; status: 400 | 404 | 409 | 500 | 503; message: string };

export type SavedRow = {
  id: string;
  method_type: string;
  details: Record<string, unknown> | null;
};

async function loadSaved(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
): Promise<SavedRow | null | "error"> {
  const { data, error } = await supabase
    .from("payment_method")
    .select("id, method_type, details")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    logger.error(
      `paymentChoice: failed fetching payment method (${error.message})`,
    );
    return "error";
  }
  return (data as SavedRow | null) ?? null;
}

/**
 * Which provider account tokenised a saved card. Cards saved before
 * 2026-09-25 carry no binding; every one of them was tokenised by the
 * default market's Paystack account, the only one that existed.
 */
async function cardBinding(
  details: Record<string, unknown>,
): Promise<{ provider: string; countryCode: string }> {
  const provider =
    typeof details.provider === "string" ? details.provider : null;
  const country =
    typeof details.countryCode === "string" ? details.countryCode : null;
  if (provider && country)
    return { provider, countryCode: country.toUpperCase() };
  return {
    provider: "paystack",
    countryCode: (await getDefaultMarket()).countryCode,
  };
}

/**
 * Can this saved instrument pay for an order in the market `offers`
 * describes, and how: charged directly (a token from the same provider
 * account, a wallet number in that country), or only through the provider's
 * page (a card tokenised by another account).
 */
export async function judgeSavedInstrument(
  saved: SavedRow,
  offers: {
    countryCode: string;
    marketName: string;
    methods: AvailablePaymentMethod[];
  },
): Promise<
  { ok: true; choice: ResolvedPaymentChoice } | { ok: false; message: string }
> {
  const methodCode: PaymentMethodCode =
    saved.method_type === "momo" ? "mobile_money" : "card";
  const offer = offers.methods.find((m) => m.method === methodCode) ?? null;
  if (!offer) {
    return {
      ok: false,
      message: `That payment method isn't available in ${offers.marketName}. Choose another way to pay.`,
    };
  }
  const details = saved.details ?? {};

  if (methodCode === "mobile_money") {
    const phone = typeof details.phone === "string" ? details.phone : "";
    if (phoneCountry(phone) !== offers.countryCode) {
      return {
        ok: false,
        message: `This mobile money wallet is registered outside ${offers.marketName}. Choose another way to pay.`,
      };
    }
    return {
      ok: true,
      choice: {
        methodCode,
        providerCode: offer.provider,
        saved:
          offer.flow === "direct"
            ? ({ method_type: "momo", details } as SelectedPaymentMethod)
            : null,
        paymentMethodId: saved.id,
        offer,
      },
    };
  }

  const binding = await cardBinding(details);
  const chargeable =
    binding.provider === offer.provider &&
    binding.countryCode === offers.countryCode;
  return {
    ok: true,
    choice: {
      methodCode,
      providerCode: offer.provider,
      saved: chargeable
        ? ({ method_type: "card", details } as SelectedPaymentMethod)
        : null,
      paymentMethodId: saved.id,
      offer,
    },
  };
}

/** The markets a buyer can pay in right now, for the order's market. */
export async function paymentOffersFor(input: {
  countryCode: string | null | undefined;
  currency: string;
  platform: ClientPlatform;
  userId?: string | null;
}): Promise<{
  countryCode: string;
  currency: string;
  transacting: boolean;
  marketName: string;
  methods: AvailablePaymentMethod[];
}> {
  const market = await getMarketOrDefault(input.countryCode);
  const transacting = isMarketTransacting(market.status);
  const { methods } = await listAvailablePaymentMethods({
    countryCode: market.countryCode,
    currency: input.currency,
    platform: input.platform,
    subjectId: input.userId ?? null,
  });
  return {
    countryCode: market.countryCode,
    currency: input.currency.toUpperCase(),
    transacting,
    marketName: market.name,
    methods: transacting ? methods : [],
  };
}

/**
 * For orders no provider touches (paid entirely with Abonten Credit): the
 * market must still be taking sales. Null when it is.
 */
export async function marketClosedForSales(
  countryCode: string | null | undefined,
): Promise<{ status: 409; message: string } | null> {
  const market = await getMarketOrDefault(countryCode);
  return isMarketTransacting(market.status)
    ? null
    : {
        status: 409,
        message: `Sales are paused in ${market.name} right now. Please try again later.`,
      };
}

export async function resolvePaymentChoice(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: PaymentChoiceInput,
  order: { countryCode: string | null | undefined; currency: string },
): Promise<PaymentChoiceResult> {
  const platform: ClientPlatform = input.platform ?? "web";
  let offers: Awaited<ReturnType<typeof paymentOffersFor>>;
  try {
    offers = await paymentOffersFor({
      countryCode: order.countryCode,
      currency: order.currency,
      platform,
      userId,
    });
  } catch (error) {
    logger.error(
      `paymentChoice: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { ok: false, status: 500, message: "Something went wrong!" };
  }

  if (!offers.transacting) {
    return {
      ok: false,
      status: 409,
      message: `Sales are paused in ${offers.marketName} right now. Please try again later.`,
    };
  }

  const offerFor = (method: PaymentMethodCode) =>
    offers.methods.find((m) => m.method === method) ?? null;

  if (input.paymentMethodId) {
    const saved = await loadSaved(supabase, userId, input.paymentMethodId);
    if (saved === "error") {
      return { ok: false, status: 500, message: "Something went wrong!" };
    }
    if (!saved) {
      return { ok: false, status: 404, message: "Payment method not found" };
    }
    const judged = await judgeSavedInstrument(saved, offers);
    return judged.ok
      ? { ok: true, choice: judged.choice }
      : { ok: false, status: 400, message: judged.message };
  }

  if (input.method) {
    const offer = offerFor(input.method as PaymentMethodCode);
    if (!offer) {
      return {
        ok: false,
        status: 400,
        message: `That way to pay isn't available in ${offers.marketName}. Choose another.`,
      };
    }
    return {
      ok: true,
      choice: {
        methodCode: offer.method,
        providerCode: offer.provider,
        saved: null,
        paymentMethodId: null,
        offer,
      },
    };
  }

  return { ok: false, status: 400, message: "Choose a payment method" };
}
