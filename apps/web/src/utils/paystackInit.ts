// Ensures exactly one Paystack transaction exists for a given payment_attempt
// row, reusing a still-open one instead of re-initializing on every retry —
// mirrors upsertPaymentAttemptForSession's own "reuse an open attempt"
// philosophy, just one level up (reuse an open Paystack transaction).
// Deliberately NOT a "use server" Server Action, same reasoning as
// ticketInventory.ts/paymentAttempt.ts: it takes an already-authorized
// Supabase client and a payment_attempt row resolved by the caller, so it
// must only ever be reached through actions that already did their own
// authorization.

import { randomUUID } from "node:crypto";
import {
  chargeAuthorization,
  initializeTransaction,
  initiateMobileMoneyCharge,
} from "@/services/paystackService";
import { logger } from "@/utils/logger";
import type { PaymentAttemptRow } from "@/utils/paymentAttempt";
import { toPesewas } from "@/utils/paystackAmount";
import type { SupabaseClient } from "@supabase/supabase-js";

type EnsurePaystackTransactionResult =
  | { status: 500; message: string }
  | {
      status: 200;
      data: { reference: string; accessCode: string; authorizationUrl: string };
    };

/**
 * Initializes a Paystack transaction for `attempt`, charging `amountInGhs`
 * (the FULL amount for this "pay" action — the grand total for a grouped
 * multi-checkout payment, not just this one row's own share). If `attempt`
 * already has a cached access code from a previous call (e.g. the user
 * re-opened the checkout page after starting payment), that's returned
 * as-is instead of calling Paystack again, so retrying never spawns a
 * second Paystack transaction for the same attempt.
 */
export async function ensurePaystackTransaction(
  supabase: SupabaseClient,
  attempt: PaymentAttemptRow,
  amountInGhs: number,
  currency: string,
  email: string,
  callbackUrl: string,
): Promise<EnsurePaystackTransactionResult> {
  const cachedAccessCode = attempt.metadata?.access_code;
  const cachedAuthorizationUrl = attempt.metadata?.authorization_url;

  if (
    attempt.provider_reference &&
    typeof cachedAccessCode === "string" &&
    typeof cachedAuthorizationUrl === "string"
  ) {
    return {
      status: 200,
      data: {
        reference: attempt.provider_reference,
        accessCode: cachedAccessCode,
        authorizationUrl: cachedAuthorizationUrl,
      },
    };
  }

  const reference = `PSK-${randomUUID()}`;

  let initialized: Awaited<ReturnType<typeof initializeTransaction>>;
  try {
    initialized = await initializeTransaction({
      email,
      amountInPesewas: toPesewas(amountInGhs),
      currency,
      reference,
      callbackUrl,
      metadata: { paymentAttemptId: attempt.id },
    });
  } catch (error) {
    logger.error(`Failed initializing Paystack transaction: ${error}`);
    return {
      status: 500,
      message: "Failed to start payment. Please try again.",
    };
  }

  const { error: updateError } = await supabase
    .from("payment_attempt")
    .update({
      provider_reference: initialized.reference,
      metadata: {
        access_code: initialized.access_code,
        authorization_url: initialized.authorization_url,
      },
      updated_at: new Date(),
    })
    .eq("id", attempt.id);

  if (updateError) {
    logger.error(
      `Failed storing Paystack reference on payment_attempt: ${updateError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  return {
    status: 200,
    data: {
      reference: initialized.reference,
      accessCode: initialized.access_code,
      authorizationUrl: initialized.authorization_url,
    },
  };
}

export type SelectedPaymentMethod = {
  method_type: "momo" | "card";
  details: Record<string, unknown>;
};

type PaystackChargeInitResult =
  | { status: 500; message: string }
  | {
      status: 200;
      data: {
        mode: "popup";
        reference: string;
        accessCode: string;
        authorizationUrl: string;
      };
    }
  | {
      status: 200;
      data: {
        mode: "direct";
        reference: string;
        chargeStatus: string;
        displayMessage?: string;
      };
    };

async function chargeCardDirect(
  supabase: SupabaseClient,
  attempt: PaymentAttemptRow,
  amountInGhs: number,
  currency: string,
  email: string,
  authorizationCode: string,
): Promise<PaystackChargeInitResult> {
  const reference = `PSK-${randomUUID()}`;

  let charge: Awaited<ReturnType<typeof chargeAuthorization>>;
  try {
    charge = await chargeAuthorization({
      authorizationCode,
      email,
      amountInPesewas: toPesewas(amountInGhs),
      currency,
      reference,
    });
  } catch (error) {
    logger.error(`Failed charging saved card authorization: ${error}`);
    return {
      status: 500,
      message: "We couldn't charge your saved card. Please try again.",
    };
  }

  const { error: updateError } = await supabase
    .from("payment_attempt")
    .update({
      provider_reference: charge.reference,
      metadata: { mode: "direct" },
      updated_at: new Date(),
    })
    .eq("id", attempt.id);

  if (updateError) {
    logger.error(
      `Failed storing card-charge reference on payment_attempt: ${updateError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  return {
    status: 200,
    data: {
      mode: "direct",
      reference: charge.reference,
      chargeStatus: charge.status,
      // Paystack's data.message carries the actual outcome (e.g. a decline
      // reason); display_text is only populated for offline/USSD-style
      // instructions — prefer whichever one is actually present.
      displayMessage: charge.message ?? charge.display_text ?? undefined,
    },
  };
}

async function chargeMomoDirect(
  supabase: SupabaseClient,
  attempt: PaymentAttemptRow,
  amountInGhs: number,
  currency: string,
  email: string,
  phone: string,
  networkCode: string,
): Promise<PaystackChargeInitResult> {
  const reference = `PSK-${randomUUID()}`;

  let charge: Awaited<ReturnType<typeof initiateMobileMoneyCharge>>;
  try {
    charge = await initiateMobileMoneyCharge({
      email,
      amountInPesewas: toPesewas(amountInGhs),
      currency,
      reference,
      phone,
      providerCode: networkCode,
    });
  } catch (error) {
    logger.error(`Failed initiating mobile money charge: ${error}`);
    return {
      status: 500,
      message: "We couldn't start your mobile money payment. Please try again.",
    };
  }

  const { error: updateError } = await supabase
    .from("payment_attempt")
    .update({
      provider_reference: charge.reference,
      metadata: { mode: "direct" },
      updated_at: new Date(),
    })
    .eq("id", attempt.id);

  if (updateError) {
    logger.error(
      `Failed storing mobile money charge reference on payment_attempt: ${updateError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  return {
    status: 200,
    data: {
      mode: "direct",
      reference: charge.reference,
      chargeStatus: charge.status,
      displayMessage: charge.message ?? charge.display_text ?? undefined,
    },
  };
}

/**
 * Decides HOW to charge for `attempt`, based on the payment method the user
 * selected:
 *  - a saved card with a captured `authorizationCode` (see
 *    confirmCardVerification.ts) is charged directly via Paystack's Charge
 *    Authorization API — no popup, the shopper isn't involved at all.
 *  - a saved mobile money wallet with a real `phone`/`networkCode` (see
 *    getPaystackMobileMoneyNetworks.ts) is charged directly via Paystack's
 *    Charge API — no popup, the shopper approves (PIN prompt) on their
 *    phone instead.
 *  - anything else (a brand new/never-saved method, or a method saved
 *    before this app supported real tokenization) falls back to the
 *    existing generic popup flow (ensurePaystackTransaction).
 *
 * Reuse is asymmetric, because the two Paystack calls behave differently:
 * calling `/transaction/initialize` (popup mode) never moves any money by
 * itself — Paystack only actually charges once the shopper completes the
 * popup — so an existing-but-never-completed popup reference is safe to
 * abandon and replace if the selected method now supports direct charging
 * (e.g. the attempt was first created before this wallet was made
 * chargeable). A `direct`-mode reference is different: calling
 * charge_authorization/`/charge` IS itself an actual charge attempt, so an
 * existing direct-mode reference is always reused as-is and never
 * re-initiated, on pain of double-charging the customer.
 */
export async function initiatePaystackChargeForAttempt(
  supabase: SupabaseClient,
  attempt: PaymentAttemptRow,
  amountInGhs: number,
  currency: string,
  email: string,
  paymentMethod: SelectedPaymentMethod,
  callbackUrl: string,
): Promise<PaystackChargeInitResult> {
  const authorizationCode = paymentMethod.details.authorizationCode;
  const canChargeCardDirect =
    paymentMethod.method_type === "card" &&
    typeof authorizationCode === "string" &&
    authorizationCode.length > 0;

  const phone = paymentMethod.details.phone;
  const networkCode = paymentMethod.details.networkCode;
  const canChargeMomoDirect =
    paymentMethod.method_type === "momo" &&
    typeof phone === "string" &&
    phone.length > 0 &&
    typeof networkCode === "string" &&
    networkCode.length > 0;

  if (attempt.provider_reference) {
    if (attempt.metadata?.mode === "direct") {
      // A real charge was already attempted for this reference — never
      // re-initiate, regardless of what the payment method looks like now.
      return {
        status: 200,
        data: {
          mode: "direct",
          reference: attempt.provider_reference,
          chargeStatus: "pending",
        },
      };
    }

    // Cached reference is popup-mode (or legacy/unset) — nothing was
    // actually charged yet, so it's safe to switch to a direct charge if
    // the selected method now supports one, instead of reopening a stale
    // generic popup.
    if (canChargeCardDirect) {
      return chargeCardDirect(
        supabase,
        attempt,
        amountInGhs,
        currency,
        email,
        authorizationCode as string,
      );
    }

    if (canChargeMomoDirect) {
      return chargeMomoDirect(
        supabase,
        attempt,
        amountInGhs,
        currency,
        email,
        phone as string,
        networkCode as string,
      );
    }

    // Still no direct-charge capability — delegate to
    // ensurePaystackTransaction's own cache check.
    const popupResult = await ensurePaystackTransaction(
      supabase,
      attempt,
      amountInGhs,
      currency,
      email,
      callbackUrl,
    );

    if (popupResult.status !== 200) {
      return popupResult;
    }

    return { status: 200, data: { mode: "popup", ...popupResult.data } };
  }

  if (canChargeCardDirect) {
    return chargeCardDirect(
      supabase,
      attempt,
      amountInGhs,
      currency,
      email,
      authorizationCode as string,
    );
  }

  if (canChargeMomoDirect) {
    return chargeMomoDirect(
      supabase,
      attempt,
      amountInGhs,
      currency,
      email,
      phone as string,
      networkCode as string,
    );
  }

  const popupResult = await ensurePaystackTransaction(
    supabase,
    attempt,
    amountInGhs,
    currency,
    email,
    callbackUrl,
  );

  if (popupResult.status !== 200) {
    return popupResult;
  }

  return { status: 200, data: { mode: "popup", ...popupResult.data } };
}
