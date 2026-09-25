// Starting the charge for a payment_attempt through whichever provider the
// market uses — the provider-neutral successor of paystackInit.ts.
//
// Reuse rules (unchanged from the Paystack-only version):
//   * A hosted/popup initialisation never moves money by itself, so an
//     existing-but-never-completed one may be replaced when a saved method
//     can now be charged directly.
//   * A `direct` charge IS a charge attempt; an existing direct reference is
//     always reused, never re-initiated, on pain of double-charging.
//
// The provider account is resolved from the attempt's market and currency
// (registry.ts). Amounts are Money; the adapters count in minor units.
// payment_attempt is written with the service-role client (clients can't
// write it — migration lock_money_path_client_writes). Deliberately NOT a
// "use server" file: callers have already authorised the attempt.

import { randomUUID } from "node:crypto";
import { logger } from "@abonten/core/logger";
import type { PaymentMethodCode } from "@abonten/core/market/types";
import type { Money } from "@abonten/core/money/money";
import type { Json } from "@abonten/types/database.types";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import type { PaymentAttemptRow } from "./paymentAttempt";
import { NoProviderError, resolveProviderAccount } from "./providers/registry";
import type {
  CheckoutInit,
  PaymentProvider,
  ProviderAccount,
} from "./providers/types";
import { PaymentProviderError } from "./providers/types";

export type SelectedPaymentMethod = {
  method_type: "momo" | "card";
  details: Record<string, unknown>;
};

export type ChargeInitResult =
  | { status: 500 | 503; message: string }
  | { status: 200; data: CheckoutInit };

function referenceFor(provider: string): string {
  return provider === "paystack"
    ? `PSK-${randomUUID()}`
    : `ABN-${randomUUID()}`;
}

async function storeInit(
  attempt: PaymentAttemptRow,
  init: CheckoutInit,
  provider: string,
  countryCode: string,
  methodCode: PaymentMethodCode,
): Promise<ChargeInitResult> {
  // Keeps what the attempt already recorded (the tax share) and says how
  // the charge was started, for support and reconciliation.
  const {
    mode: _mode,
    access_code: _accessCode,
    authorization_url: _authorizationUrl,
    public_key: _publicKey,
    url: _url,
    ...kept
  } = attempt.metadata ?? {};
  const base: Record<string, unknown> = { ...kept, method: methodCode };
  const metadata: Record<string, unknown> =
    init.mode === "popup"
      ? {
          ...base,
          mode: "popup",
          access_code: init.accessCode,
          authorization_url: init.authorizationUrl,
          public_key: init.publicKey,
        }
      : init.mode === "redirect"
        ? { ...base, mode: "redirect", url: init.url }
        : { ...base, mode: "direct" };
  const { error } = await getSupabaseServiceClient()
    .from("payment_attempt")
    .update({
      provider,
      country_code: countryCode,
      provider_reference: init.reference,
      metadata: metadata as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attempt.id);
  if (error) {
    logger.error(
      `Failed storing provider reference on payment_attempt: ${error.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }
  return { status: 200, data: init };
}

function cachedInit(
  attempt: PaymentAttemptRow,
  provider: string,
): CheckoutInit | null {
  const meta = attempt.metadata ?? {};
  const ref = attempt.provider_reference;
  if (!ref) return null;
  if (meta.mode === "direct") {
    return {
      mode: "direct",
      provider: provider as CheckoutInit["provider"],
      reference: ref,
      chargeStatus: "pending",
    };
  }
  if (meta.mode === "redirect" && typeof meta.url === "string") {
    return {
      mode: "redirect",
      provider: provider as CheckoutInit["provider"],
      reference: ref,
      url: meta.url,
    };
  }
  if (
    typeof meta.access_code === "string" &&
    typeof meta.authorization_url === "string"
  ) {
    return {
      mode: "popup",
      provider: provider as CheckoutInit["provider"],
      reference: ref,
      accessCode: meta.access_code,
      authorizationUrl: meta.authorization_url,
      publicKey: typeof meta.public_key === "string" ? meta.public_key : null,
    };
  }
  return null;
}

function describeFailure(error: unknown, fallback: string): ChargeInitResult {
  if (error instanceof NoProviderError) {
    logger.error(`chargeInit: ${error.message}`);
    return {
      status: 503,
      message:
        "Payments aren't available for this market yet. Please try again later.",
    };
  }
  logger.error(
    `chargeInit: ${error instanceof PaymentProviderError ? error.message : String(error)}`,
  );
  return { status: 500, message: fallback };
}

/**
 * Starts (or resumes) the charge for `attempt`: a direct charge when the
 * selected saved method carries a usable token and the provider supports
 * it, otherwise the provider's hosted page / popup for `methodCode`.
 * `paymentMethod` is only the instrument paymentChoice.ts judged chargeable
 * by this very account; a card tokenised elsewhere arrives as null.
 */
export async function initiateChargeForAttempt(input: {
  attempt: PaymentAttemptRow;
  amount: Money;
  countryCode: string | null | undefined;
  email: string;
  paymentMethod: SelectedPaymentMethod | null;
  /** How the buyer is paying; decides the hosted page's channels. */
  methodCode: PaymentMethodCode;
  /** The provider paymentChoice.ts picked for that method. */
  providerCode?: string | null;
  callbackUrl: string;
  description?: string;
}): Promise<ChargeInitResult> {
  const { attempt, amount, email, paymentMethod, callbackUrl, methodCode } =
    input;

  let provider: PaymentProvider;
  let account: ProviderAccount;
  try {
    ({ provider, account } = await resolveProviderAccount({
      countryCode: input.countryCode,
      currency: amount.currency,
      providerCode: attempt.provider_reference
        ? attempt.provider
        : (input.providerCode ?? null),
      method: methodCode,
    }));
  } catch (error) {
    return describeFailure(error, "Failed to start payment. Please try again.");
  }

  const caps = provider.capabilities(account);
  const token = paymentMethod?.details.authorizationCode;
  const canChargeCardDirect =
    caps.savedCards &&
    paymentMethod?.method_type === "card" &&
    typeof token === "string" &&
    token.length > 0;
  const phone = paymentMethod?.details.phone;
  const networkCode = paymentMethod?.details.networkCode;
  const canChargeMomoDirect =
    caps.directMobileMoney &&
    paymentMethod?.method_type === "momo" &&
    typeof phone === "string" &&
    phone.length > 0 &&
    typeof networkCode === "string" &&
    networkCode.length > 0;

  const cached = cachedInit(attempt, account.provider);
  if (cached && cached.mode === "direct") {
    return { status: 200, data: cached };
  }

  try {
    if (canChargeCardDirect) {
      const init = await provider.chargeSavedCard(account, {
        email,
        amount,
        reference: referenceFor(account.provider),
        token: token as string,
      });
      return storeInit(
        attempt,
        init,
        account.provider,
        account.countryCode,
        methodCode,
      );
    }
    if (canChargeMomoDirect) {
      const init = await provider.chargeMobileMoney(account, {
        email,
        amount,
        reference: referenceFor(account.provider),
        phoneE164: phone as string,
        networkCode: networkCode as string,
      });
      return storeInit(
        attempt,
        init,
        account.provider,
        account.countryCode,
        methodCode,
      );
    }
    if (cached) {
      return { status: 200, data: cached };
    }
    const init = await provider.initializeCheckout(account, {
      email,
      amount,
      reference: referenceFor(account.provider),
      callbackUrl,
      metadata: { paymentAttemptId: attempt.id },
      description: input.description,
      methods: [methodCode],
    });
    return storeInit(
      attempt,
      init,
      account.provider,
      account.countryCode,
      methodCode,
    );
  } catch (error) {
    return describeFailure(
      error,
      methodCode === "mobile_money"
        ? "We couldn't start your mobile money payment. Please try again."
        : "We couldn't start your payment. Please try again.",
    );
  }
}
