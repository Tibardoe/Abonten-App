// Starting the charge for a payment_attempt through whichever provider the
// market uses — the provider-neutral successor of paystackInit.ts.
//
// One attempt, one charge (2026-09-25):
//   * An attempt is bound to the amount it was started for. Asked to charge
//     a different amount, it is retired (cancelled, reference kept) and the
//     caller starts a fresh attempt — a provider page opened for the old
//     amount is never handed back for a new one.
//   * A reference is never overwritten. Before, starting a new charge on an
//     attempt replaced its reference, so paying the older page (a second
//     tab) reached a webhook that no longer knew the reference and the money
//     was silently kept. A retired attempt keeps its reference, so a late
//     payment on it is found and refunded (finalizePayment →
//     reconcileClosedAttempt).
//   * The attempt is CLAIMED before the provider is called (our reference
//     written where none was), so two concurrent requests can't both start a
//     charge on it; the loser is told to try again.
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
  /**
   * The attempt was already started for a different charge (another amount,
   * or a provider page this call would replace). It has been cancelled —
   * its reference stays on it, so a late payment on it is found and
   * refunded — and the caller should start again on a fresh attempt.
   */
  | { status: 409; message: string; stale: true }
  | { status: 200; data: CheckoutInit };

const STALE_MESSAGE =
  "This order changed since its payment was started. Please try again.";

/** The charge an attempt was started for, when it recorded one. */
function startedCharge(attempt: PaymentAttemptRow): Money | null {
  const meta = attempt.metadata ?? {};
  return typeof meta.charge_minor === "number" &&
    typeof meta.charge_currency === "string"
    ? { amountMinor: meta.charge_minor, currency: meta.charge_currency }
    : null;
}

/**
 * Retires an attempt that can't be reused for this charge. Only an open
 * attempt moves; its provider reference is kept, which is what lets
 * finalizePayment recognise (and refund) a late payment on it.
 */
async function retireAttempt(
  attempt: PaymentAttemptRow,
): Promise<ChargeInitResult> {
  const { error } = await getSupabaseServiceClient()
    .from("payment_attempt")
    .update({
      status: "cancelled",
      failure_reason: "Replaced: the order changed after payment started",
      updated_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .in("status", ["initiated", "pending"]);
  if (error) {
    logger.error(
      `chargeInit: failed retiring attempt ${attempt.id}: ${error.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }
  return { status: 409, message: STALE_MESSAGE, stale: true };
}

function referenceFor(provider: string): string {
  return provider === "paystack"
    ? `PSK-${randomUUID()}`
    : `ABN-${randomUUID()}`;
}

function initMetadata(
  attempt: PaymentAttemptRow,
  methodCode: PaymentMethodCode,
  charge: Money,
  init: CheckoutInit | null,
): Record<string, unknown> {
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
  const base: Record<string, unknown> = {
    ...kept,
    method: methodCode,
    charge_minor: charge.amountMinor,
    charge_currency: charge.currency,
  };
  if (!init) return base;
  return init.mode === "popup"
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
}

/**
 * Claims the attempt for one charge: writes our reference where there was
 * none. Only one caller can win; the provider is called after this, so a
 * lost race never starts a second charge.
 */
async function claimAttempt(
  attempt: PaymentAttemptRow,
  reference: string,
  provider: string,
  countryCode: string,
  methodCode: PaymentMethodCode,
  charge: Money,
): Promise<"claimed" | "taken" | "error"> {
  const { data, error } = await getSupabaseServiceClient()
    .from("payment_attempt")
    .update({
      provider,
      country_code: countryCode,
      provider_reference: reference,
      metadata: initMetadata(attempt, methodCode, charge, null) as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .is("provider_reference", null)
    .in("status", ["initiated", "pending"])
    .select("id")
    .maybeSingle();
  if (error) {
    logger.error(
      `chargeInit: failed claiming attempt ${attempt.id}: ${error.message}`,
    );
    return "error";
  }
  return data ? "claimed" : "taken";
}

/** Records how the claimed charge started (the provider's reference may differ). */
async function recordInit(
  attempt: PaymentAttemptRow,
  claimedReference: string,
  init: CheckoutInit,
  methodCode: PaymentMethodCode,
  charge: Money,
): Promise<ChargeInitResult> {
  const { error } = await getSupabaseServiceClient()
    .from("payment_attempt")
    .update({
      provider_reference: init.reference,
      metadata: initMetadata(attempt, methodCode, charge, init) as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .eq("provider_reference", claimedReference);
  if (error) {
    logger.error(
      `Failed storing provider reference on payment_attempt: ${error.message}`,
      { payment: { attemptId: attempt.id, reference: init.reference } },
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

  // An attempt started for another amount is never resumed: its provider
  // page would collect the old figure. Attempts from before charge amounts
  // were recorded are resumed as before.
  const started = startedCharge(attempt);
  if (
    attempt.provider_reference &&
    started &&
    (started.amountMinor !== amount.amountMinor ||
      started.currency !== amount.currency)
  ) {
    return retireAttempt(attempt);
  }

  const cached = cachedInit(attempt, account.provider);
  if (cached && cached.mode === "direct") {
    return { status: 200, data: cached };
  }
  if (cached && !canChargeCardDirect && !canChargeMomoDirect) {
    return { status: 200, data: cached };
  }
  // Starting a new charge on an attempt that already handed one out would
  // orphan the first reference; retire it and let the caller start fresh.
  if (attempt.provider_reference) {
    return retireAttempt(attempt);
  }

  const reference = referenceFor(account.provider);
  const claim = await claimAttempt(
    attempt,
    reference,
    account.provider,
    account.countryCode,
    methodCode,
    amount,
  );
  if (claim === "error") {
    return { status: 500, message: "Something went wrong!" };
  }
  if (claim === "taken") {
    return {
      status: 409,
      message: "This payment is already being started. Please wait a moment.",
      stale: true,
    };
  }

  try {
    let init: CheckoutInit;
    if (canChargeCardDirect) {
      init = await provider.chargeSavedCard(account, {
        email,
        amount,
        reference,
        token: token as string,
      });
    } else if (canChargeMomoDirect) {
      init = await provider.chargeMobileMoney(account, {
        email,
        amount,
        reference,
        phoneE164: phone as string,
        networkCode: networkCode as string,
      });
    } else {
      init = await provider.initializeCheckout(account, {
        email,
        amount,
        reference,
        callbackUrl,
        metadata: { paymentAttemptId: attempt.id },
        description: input.description,
        methods: [methodCode],
      });
    }
    return recordInit(attempt, reference, init, methodCode, amount);
  } catch (error) {
    return describeFailure(
      error,
      methodCode === "mobile_money"
        ? "We couldn't start your mobile money payment. Please try again."
        : "We couldn't start your payment. Please try again.",
    );
  }
}
