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
//     charge on it. The loser (a double-tapped Pay) waits for the winner's
//     provider page and hands back that same page; it never retires the
//     attempt, because that would cancel the charge the winner is opening
//     and send the buyer to a second one (2026-09-29, caught by the
//     payment-attempt-reuse suite). A claim still without a page after
//     CLAIM_IN_FLIGHT_MS is treated as abandoned and retired as before.
//   * A provider error after the claim retires the attempt (reference kept),
//     so the next try starts clean instead of finding a claim with no page.
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
import { tr } from "../i18n/requestLocale";
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
  /**
   * Another request is opening this very charge and did not finish within
   * CLAIM_WAIT_MS. The attempt is untouched: the caller must NOT cancel it
   * (that would kill the other request's charge); the buyer tries again.
   */
  | { status: 409; message: string; busy: true }
  | { status: 200; data: CheckoutInit };

const STALE_MESSAGE =
  "This order changed since its payment was started. Please try again.";
const BUSY_MESSAGE =
  "This payment is already being started. Please wait a moment.";

// A claim whose provider page isn't recorded yet counts as another request
// still opening it for this long (the provider call's own deadline is 20 s,
// HTTP_TIMEOUTS.paystackWrite); after that it was abandoned.
const CLAIM_IN_FLIGHT_MS = 45_000;
// How long a request that lost the claim waits for the winner's page.
const CLAIM_WAIT_MS = 12_000;
const CLAIM_POLL_MS = 250;

const ATTEMPT_ROW_SELECT =
  "id, provider, country_code, status, amount, currency, payment_method_id, provider_reference, metadata";

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
  reason = "Replaced: the order changed after payment started",
): Promise<ChargeInitResult> {
  const { error } = await getSupabaseServiceClient()
    .from("payment_attempt")
    .update({
      status: "cancelled",
      failure_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .in("status", ["initiated", "pending"]);
  if (error) {
    logger.error(
      `chargeInit: failed retiring attempt ${attempt.id}: ${error.message}`,
    );
    return { status: 500, message: tr("somethingWentWrong") };
  }
  return { status: 409, message: STALE_MESSAGE, stale: true };
}

/** Claimed by a request that may still be opening its provider page. */
function claimInFlight(attempt: PaymentAttemptRow): boolean {
  const claimedAt = attempt.metadata?.claimed_at;
  if (typeof claimedAt !== "string") return false;
  const age = Date.now() - new Date(claimedAt).getTime();
  return Number.isFinite(age) && age < CLAIM_IN_FLIGHT_MS;
}

/**
 * The request that lost the claim waits for the winner to record its
 * provider page and returns that page, so a double-tapped Pay ends on one
 * charge. Closed meanwhile (the winner failed, or the order changed):
 * stale, start again. Still no page after CLAIM_WAIT_MS: busy, and the
 * attempt is left alone.
 */
async function awaitClaimedCharge(
  attemptId: string,
  provider: string,
): Promise<ChargeInitResult> {
  const deadline = Date.now() + CLAIM_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, CLAIM_POLL_MS));
    const { data, error } = await getSupabaseServiceClient()
      .from("payment_attempt")
      .select(ATTEMPT_ROW_SELECT)
      .eq("id", attemptId)
      .maybeSingle();
    if (error) {
      logger.error(
        `chargeInit: failed re-reading attempt ${attemptId}: ${error.message}`,
      );
      return { status: 500, message: tr("somethingWentWrong") };
    }
    const row = data as PaymentAttemptRow | null;
    if (!row || (row.status !== "initiated" && row.status !== "pending")) {
      return { status: 409, message: STALE_MESSAGE, stale: true };
    }
    const cached = cachedInit(row, provider);
    if (cached) return { status: 200, data: cached };
  }
  return { status: 409, message: BUSY_MESSAGE, busy: true };
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
      // claimed_at: how another request tells an in-flight claim from an
      // abandoned one (claimInFlight). recordInit's metadata drops it.
      metadata: {
        ...initMetadata(attempt, methodCode, charge, null),
        claimed_at: new Date().toISOString(),
      } as Json,
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
  const { data, error } = await getSupabaseServiceClient()
    .from("payment_attempt")
    .update({
      provider_reference: init.reference,
      metadata: initMetadata(attempt, methodCode, charge, init) as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .eq("provider_reference", claimedReference)
    .in("status", ["initiated", "pending"])
    .select("id")
    .maybeSingle();
  if (error) {
    logger.error(
      `Failed storing provider reference on payment_attempt: ${error.message}`,
      { payment: { attemptId: attempt.id, reference: init.reference } },
    );
    return { status: 500, message: tr("somethingWentWrong") };
  }
  // Closed while the page was being opened (the buyer changed the order or
  // the method): that page must not be handed out. Its reference stays on
  // the closed attempt, so a payment on it would still be refunded.
  if (!data) return { status: 409, message: STALE_MESSAGE, stale: true };
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
      message: tr("paymentsArenTAvailableForThis"),
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
  // Claimed by another request that is still opening its page: wait for
  // that page rather than retiring the attempt from under it.
  if (attempt.provider_reference && !cached && claimInFlight(attempt)) {
    return awaitClaimedCharge(attempt.id, account.provider);
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
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (claim === "taken") {
    return awaitClaimedCharge(attempt.id, account.provider);
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
    // The claim would otherwise sit with no page, and every retry within
    // CLAIM_IN_FLIGHT_MS would wait for one. The reference stays on the
    // retired attempt in case the provider did open something.
    await retireAttempt(attempt, "Payment could not be started");
    return describeFailure(
      error,
      methodCode === "mobile_money"
        ? "We couldn't start your mobile money payment. Please try again."
        : "We couldn't start your payment. Please try again.",
    );
  }
}
