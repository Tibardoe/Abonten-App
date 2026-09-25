// What a buyer can pay THIS order with — the web checkout's payment step and
// the mobile PaymentSection both read it, so neither client decides which
// methods a market has. The order (tickets, or a promotion / Spotlight
// checkout) is loaded server-side and its market and currency come from the
// listing; the answer lists:
//   * `methods`: the ways to pay on the provider's page, as the market
//     configures them (card, bank transfer, USSD, Apple Pay…);
//   * `saved`: each saved instrument in the buyer's wallet, whether it can
//     pay here, and whether it is charged directly or via the provider page.
// The attempt endpoints check the same rules again (paymentChoice.ts).

import { logger } from "@abonten/core/logger";
import type { ClientPlatform } from "@abonten/core/market/types";
import type { Database } from "@abonten/types/database.types";
import type {
  CheckoutPaymentOptions,
  SavedInstrumentOption,
} from "@abonten/types/paymentOptionsType";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MixedMarketCheckoutError,
  prepareCheckoutPayment,
} from "../checkout/checkoutPaymentPreparation";
import {
  type PromotionKind,
  loadPromotionOrder,
} from "../rewards/creditRedemptionCore";
import {
  type SavedRow,
  judgeSavedInstrument,
  paymentOffersFor,
} from "./paymentChoice";

export type CheckoutPaymentTarget =
  | { kind: "ticket"; checkoutSessionIds: string[] }
  | { kind: PromotionKind; checkoutId: string };

export type {
  CheckoutPaymentOptions,
  SavedInstrumentOption,
} from "@abonten/types/paymentOptionsType";

export type CheckoutPaymentOptionsResult =
  | { status: 400 | 404 | 409 | 500; message: string }
  | { status: 200; data: CheckoutPaymentOptions };

async function orderMarket(
  supabase: SupabaseClient<Database>,
  userId: string,
  target: CheckoutPaymentTarget,
): Promise<
  | { ok: true; countryCode: string | null; currency: string }
  | { ok: false; status: 400 | 404 | 409 | 500; message: string }
> {
  if (target.kind === "ticket") {
    if (target.checkoutSessionIds.length === 0) {
      return { ok: false, status: 400, message: "No checkouts selected" };
    }
    try {
      const prepared = await prepareCheckoutPayment(
        userId,
        target.checkoutSessionIds,
        supabase,
      );
      if (prepared.validSessions.length === 0) {
        return {
          ok: false,
          status: 409,
          message: "These checkouts have expired. Please review your order.",
        };
      }
      return {
        ok: true,
        countryCode: prepared.countryCode,
        currency: prepared.currency,
      };
    } catch (error) {
      if (error instanceof MixedMarketCheckoutError) {
        return {
          ok: false,
          status: 409,
          message:
            "Tickets for events in different countries are paid separately.",
        };
      }
      logger.error(`checkoutPaymentOptions: ${String(error)}`);
      return { ok: false, status: 500, message: "Something went wrong!" };
    }
  }
  try {
    const order = await loadPromotionOrder(
      supabase,
      userId,
      target.kind,
      target.checkoutId,
    );
    if (!order)
      return { ok: false, status: 404, message: "Checkout not found" };
    return {
      ok: true,
      countryCode: order.countryCode,
      currency: order.currency,
    };
  } catch (error) {
    logger.error(`checkoutPaymentOptions: ${String(error)}`);
    return { ok: false, status: 500, message: "Something went wrong!" };
  }
}

export async function getCheckoutPaymentOptionsCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  target: CheckoutPaymentTarget,
  platform: ClientPlatform,
): Promise<CheckoutPaymentOptionsResult> {
  const where = await orderMarket(supabase, userId, target);
  if (!where.ok) return { status: where.status, message: where.message };

  let offers: Awaited<ReturnType<typeof paymentOffersFor>>;
  try {
    offers = await paymentOffersFor({
      countryCode: where.countryCode,
      currency: where.currency,
      platform,
      userId,
    });
  } catch (error) {
    logger.error(`checkoutPaymentOptions: ${String(error)}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const { data: rows, error } = await supabase
    .from("payment_method")
    .select("id, method_type, details")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) {
    logger.error(`checkoutPaymentOptions: wallet (${error.message})`);
    return { status: 500, message: "Something went wrong!" };
  }

  const saved: SavedInstrumentOption[] = [];
  for (const row of (rows ?? []) as SavedRow[]) {
    const judged = await judgeSavedInstrument(row, offers);
    saved.push(
      judged.ok
        ? {
            id: row.id,
            usable: true,
            direct: judged.choice.saved !== null,
            method: judged.choice.methodCode,
            reason: null,
          }
        : {
            id: row.id,
            usable: false,
            direct: false,
            method: row.method_type === "momo" ? "mobile_money" : "card",
            reason: judged.message,
          },
    );
  }

  return {
    status: 200,
    data: {
      countryCode: offers.countryCode,
      marketName: offers.marketName,
      currency: offers.currency,
      transacting: offers.transacting,
      methods: offers.methods,
      saved,
    },
  };
}
