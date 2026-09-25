import { randomUUID } from "node:crypto";
import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMarketOrDefault } from "../markets/marketConfig";
import {
  type AddPaymentMethodResult,
  addPaymentMethodCore,
} from "./paymentMethodCore";
import { NoProviderError, resolveProviderAccount } from "./providers/registry";
import type {
  CheckoutInit,
  PaymentProvider,
  ProviderAccount,
} from "./providers/types";

// Post-auth bodies of initCardVerification / confirmCardVerification, lifted
// so the `/api/mobile/payment-methods/card/*` routes run the exact same
// flow as the web Server Actions. A provider that tokenises cards through a
// real charge (Paystack) starts a small `card`-channel charge in the
// person's home market currency, captures the reusable token from the
// verified result, refunds the charge (best-effort), and saves only the
// non-sensitive display fields + the token — never a PAN/CVV. A market
// whose provider cannot tokenise (Stripe, in this version) refuses with a
// clear message and the checkout uses the hosted page each time instead.
// Deliberately NOT a "use server" file (see ticketInventory.ts).

export type InitCardVerificationCoreResult =
  | { status: 400 | 500; message: string }
  | {
      status: 200;
      data: {
        reference: string;
        accessCode: string;
        authorizationUrl: string;
        publicKey: string | null;
        provider: string;
      };
    };

async function providerForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{
  provider: PaymentProvider;
  account: ProviderAccount;
  currency: string;
}> {
  const { data: profile } = await supabase
    .from("user_info")
    .select("country_code")
    .eq("id", userId)
    .maybeSingle();
  const market = await getMarketOrDefault(profile?.country_code ?? null);
  const { provider, account } = await resolveProviderAccount({
    countryCode: market.countryCode,
    currency: market.defaultCurrency,
    method: "card",
  });
  return { provider, account, currency: market.defaultCurrency };
}

export async function initCardVerificationCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  userEmail: string,
  callbackUrl: string,
): Promise<InitCardVerificationCoreResult> {
  let resolved: Awaited<ReturnType<typeof providerForUser>>;
  try {
    resolved = await providerForUser(supabase, userId);
  } catch (error) {
    if (error instanceof NoProviderError) {
      return {
        status: 400,
        message: "Card payments aren't available in your market yet.",
      };
    }
    logger.error(`initCardVerification: provider resolution failed: ${error}`);
    return {
      status: 500,
      message: "Couldn't start card verification. Please try again.",
    };
  }

  const { provider, account, currency } = resolved;
  const amount = provider.cardVerificationAmount(account, currency);
  if (!amount || !provider.capabilities(account).savedCards) {
    return {
      status: 400,
      message:
        "Saving a card isn't available in your market. You can still pay by card at checkout.",
    };
  }

  const reference = `PSKCARD-${randomUUID()}`;
  let init: CheckoutInit;
  try {
    init = await provider.initializeCheckout(account, {
      email: userEmail,
      amount,
      reference,
      callbackUrl,
      methods: ["card"],
      metadata: { purpose: "card_verification", userId },
      description: "Card verification (refunded)",
    });
  } catch (error) {
    logger.error(`Failed initializing card verification: ${error}`);
    return {
      status: 500,
      message: "Couldn't start card verification. Please try again.",
    };
  }
  if (init.mode !== "popup") {
    return {
      status: 400,
      message:
        "Saving a card isn't available in your market. You can still pay by card at checkout.",
    };
  }

  return {
    status: 200,
    data: {
      reference: init.reference,
      accessCode: init.accessCode,
      authorizationUrl: init.authorizationUrl,
      publicKey: init.publicKey,
      provider: init.provider,
    },
  };
}

export type ConfirmCardVerificationCoreResult =
  | { status: 400 | 401 | 500; message: string }
  | AddPaymentMethodResult;

export async function confirmCardVerificationCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  userEmail: string,
  reference: string,
  label?: string,
): Promise<ConfirmCardVerificationCoreResult> {
  let resolved: Awaited<ReturnType<typeof providerForUser>>;
  try {
    resolved = await providerForUser(supabase, userId);
  } catch (error) {
    logger.error(
      `confirmCardVerification: provider resolution failed: ${error}`,
    );
    return {
      status: 500,
      message: "Couldn't verify your card. Please try again.",
    };
  }
  const { provider, account } = resolved;

  let verification: Awaited<ReturnType<PaymentProvider["verify"]>>;
  try {
    verification = await provider.verify(account, reference);
  } catch (error) {
    logger.error(`Failed verifying card verification charge: ${error}`);
    return {
      status: 500,
      message: "Couldn't verify your card. Please try again.",
    };
  }

  // A reference alone isn't proof of ownership — the verified charge's
  // customer email must match the caller.
  if (verification.customerEmail !== userEmail) {
    logger.error(
      "confirmCardVerification: verified charge belongs to a different customer email",
    );
    return { status: 401, message: "Not authorized" };
  }

  if (verification.status !== "success") {
    return {
      status: 400,
      message: "Your card could not be verified. Please try again.",
    };
  }

  const instrument = verification.instrument;

  if (!instrument || !instrument.reusable) {
    return {
      status: 400,
      message:
        "This card can't be saved for future payments. Please try a different card.",
    };
  }

  try {
    await provider.refund(account, {
      reference,
      providerTransactionId: verification.providerTransactionId,
      amount: null,
    });
  } catch (error) {
    // Best-effort only — the token is already captured and safe to save
    // regardless of whether the refund succeeds.
    logger.error(
      `Card verification refund failed for reference ${reference}: ${error}`,
    );
  }

  return addPaymentMethodCore(supabase, userId, {
    type: "card",
    brand: instrument.brand,
    last4: instrument.last4,
    expiryMonth: instrument.expiryMonth,
    expiryYear: instrument.expiryYear,
    authorizationCode: instrument.token,
    bank: instrument.bank,
    label,
  });
}
