// Stripe adapter, for markets outside Paystack's footprint (UK, US, EU…).
// Built on Stripe's REST API with plain fetch, the way the Paystack adapter
// is, so no SDK has to be bundled into the server.
//
// Model (docs.stripe.com):
//   * Checkout Sessions in `payment` mode give a hosted page: the client is
//     REDIRECTED to `url` and comes back to `callbackUrl`. The session id
//     (`cs_…`) is Abonten's provider reference; the PaymentIntent (`pi_…`)
//     is the provider transaction id refunds and disputes refer to.
//   * Verification retrieves the session: `payment_status = paid` and the
//     amount/currency must match what Abonten asked for.
//   * Refunds are created against the PaymentIntent (full or partial) and
//     confirmed by `charge.refunded` webhooks.
//   * Webhooks are signed `Stripe-Signature: t=…,v1=…` (HMAC-SHA256 over
//     "t.body"), with a 5-minute tolerance.
//   * Saved cards would need SetupIntents + off-session PaymentIntents;
//     mobile money does not exist here; organizer payouts would need Stripe
//     Connect onboarding. Those capabilities are reported FALSE, so the UI
//     never offers them and readiness shows payouts as manual.
//
// Amounts: Stripe counts in the currency's minor unit for 0- and 2-decimal
// currencies, which is what `Money.amountMinor` is; 3-decimal currencies
// are not enabled for any Stripe market here.

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";
import type { PaymentMethodCode } from "@abonten/core/market/types";
import { type Money, money } from "@abonten/core/money/money";
import { z } from "zod";
import type {
  CheckoutInit,
  InitializeCheckoutInput,
  NormalizedWebhookEvent,
  ParsedWebhook,
  PaymentProvider,
  ProviderAccount,
  ProviderCapabilities,
  VerificationResult,
} from "./types";
import { PaymentProviderError } from "./types";

const BASE_URL = "https://api.stripe.com/v1";
const API_VERSION = "2025-08-27.basil";
const SIGNATURE_TOLERANCE_S = 300;

/** Abonten method code -> Stripe payment_method_types entry. */
const STRIPE_TYPE_FOR_METHOD: Partial<Record<PaymentMethodCode, string>> = {
  card: "card",
  // Apple Pay / Google Pay ride on `card` in Checkout and appear
  // automatically when the browser/device supports them.
  apple_pay: "card",
  google_pay: "card",
  // Bancontact: Belgian bank redirect, euros only. Stripe's bank transfers
  // (`customer_balance`) need a Customer object and reconciliation Abonten
  // does not run, so bank_transfer is deliberately not offered here.
  bank_redirect: "bancontact",
};

/** Stripe payment method types that only run in one currency. */
const CURRENCY_FOR_TYPE: Record<string, string> = { bancontact: "EUR" };

const sessionSchema = z.object({
  id: z.string(),
  url: z.string().nullable().optional(),
  payment_status: z.enum(["paid", "unpaid", "no_payment_required"]),
  status: z.enum(["open", "complete", "expired"]).nullable().optional(),
  amount_total: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  payment_intent: z
    .union([
      z.string(),
      z.object({ id: z.string(), status: z.string().nullable().optional() }),
    ])
    .nullable()
    .optional(),
  customer_details: z
    .object({ email: z.string().nullable().optional() })
    .nullable()
    .optional(),
  customer_email: z.string().nullable().optional(),
  client_reference_id: z.string().nullable().optional(),
});

function encodeForm(params: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (v && typeof v === "object")
          out.push(
            ...encodeForm(v as Record<string, unknown>, `${name}[${i}]`),
          );
        else
          out.push(
            `${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(v))}`,
          );
      });
    } else if (typeof value === "object") {
      out.push(...encodeForm(value as Record<string, unknown>, name));
    } else {
      out.push(
        `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`,
      );
    }
  }
  return out;
}

async function call<T>(
  account: ProviderAccount,
  path: string,
  init: {
    method: "GET" | "POST";
    body?: Record<string, unknown>;
    idempotencyKey?: string;
  },
): Promise<{ ok: boolean; status: number; json: T | null }> {
  const res = await fetchWithTimeout(`${BASE_URL}${path}`, {
    timeoutMs:
      init.method === "GET"
        ? HTTP_TIMEOUTS.paystackRead
        : HTTP_TIMEOUTS.paystackWrite,
    method: init.method,
    headers: {
      Authorization: `Bearer ${account.credentials.secretKey}`,
      "Stripe-Version": API_VERSION,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(init.idempotencyKey
        ? { "Idempotency-Key": init.idempotencyKey }
        : {}),
    },
    body: init.body ? encodeForm(init.body).join("&") : undefined,
  });
  const json = (await res.json().catch(() => null)) as T | null;
  return { ok: res.ok, status: res.status, json };
}

type StripeError = { error?: { message?: string; code?: string } };

function fail(json: unknown, fallback: string, status?: number): never {
  const msg = (json as StripeError | null)?.error?.message;
  throw new PaymentProviderError(
    typeof msg === "string" ? msg : fallback,
    "stripe",
    status,
  );
}

function unsupported(what: string): never {
  throw new PaymentProviderError(
    `${what} is not supported by the Stripe adapter`,
    "stripe",
  );
}

/** The PaymentIntent behind a completed-but-unpaid session gave up. */
function paymentIntentFailed(session: z.infer<typeof sessionSchema>): boolean {
  const pi = session.payment_intent;
  if (!pi || typeof pi === "string") return false;
  return pi.status === "canceled" || pi.status === "requires_payment_method";
}

function paymentIntentId(
  session: z.infer<typeof sessionSchema>,
): string | null {
  const pi = session.payment_intent;
  if (!pi) return null;
  return typeof pi === "string" ? pi : pi.id;
}

export const stripeProvider: PaymentProvider = {
  code: "stripe",

  capabilities(): ProviderCapabilities {
    return {
      methods: ["card", "apple_pay", "google_pay", "bank_redirect"],
      savedCards: false,
      directMobileMoney: false,
      refunds: true,
      partialRefunds: true,
      payouts: false,
      checkoutModes: ["redirect"],
      reportsProcessingFee: false,
      webhooks: true,
    };
  },

  supportsMethod(account, method, currency) {
    const type = STRIPE_TYPE_FOR_METHOD[method];
    if (!type) return false;
    const only = CURRENCY_FOR_TYPE[type];
    if (only && only !== currency.toUpperCase()) return false;
    return account.currencies
      .map((c) => c.toUpperCase())
      .includes(currency.toUpperCase());
  },

  cardVerificationAmount() {
    // Cards are not tokenised through a test charge on Stripe (it would
    // need SetupIntents); the UI offers the hosted page each time.
    return null;
  },

  async initializeCheckout(
    account,
    input: InitializeCheckoutInput,
  ): Promise<CheckoutInit> {
    const types = Array.from(
      new Set(
        (input.methods ?? ["card"])
          .map((m) => STRIPE_TYPE_FOR_METHOD[m])
          .filter((t): t is string => !!t),
      ),
    );
    const separator = input.callbackUrl.includes("?") ? "&" : "?";
    const body: Record<string, unknown> = {
      mode: "payment",
      client_reference_id: input.reference,
      customer_email: input.email,
      success_url: `${input.callbackUrl}${separator}provider=stripe&reference=${encodeURIComponent(input.reference)}&outcome=success`,
      cancel_url: `${input.callbackUrl}${separator}provider=stripe&reference=${encodeURIComponent(input.reference)}&outcome=cancel`,
      payment_method_types: types.length > 0 ? types : ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.amount.currency.toLowerCase(),
            unit_amount: input.amount.amountMinor,
            product_data: { name: input.description ?? "Abonten order" },
          },
        },
      ],
      metadata: {
        abonten_reference: input.reference,
        ...(input.metadata ?? {}),
      },
      payment_intent_data: { metadata: { abonten_reference: input.reference } },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    };
    const { ok, status, json } = await call<unknown>(
      account,
      "/checkout/sessions",
      {
        method: "POST",
        body,
        idempotencyKey: `checkout:${input.reference}`,
      },
    );
    if (!ok) fail(json, "Stripe checkout initialization failed", status);
    const parsed = sessionSchema.safeParse(json);
    if (!parsed.success || !parsed.data.url)
      fail(null, "Unexpected Stripe checkout session shape");
    return {
      mode: "redirect",
      provider: "stripe",
      reference: parsed.data.id,
      url: parsed.data.url,
    };
  },

  async chargeSavedCard() {
    unsupported("Charging a saved card");
  },

  async chargeMobileMoney() {
    unsupported("Mobile money");
  },

  async submitOtp() {
    unsupported("OTP submission");
  },

  async verify(account, reference): Promise<VerificationResult> {
    const { ok, status, json } = await call<unknown>(
      account,
      `/checkout/sessions/${encodeURIComponent(reference)}?expand[]=payment_intent`,
      {
        method: "GET",
      },
    );
    if (!ok) fail(json, "Stripe verification failed", status);
    const parsed = sessionSchema.safeParse(json);
    if (!parsed.success) fail(null, "Unexpected Stripe session shape");
    const s = parsed.data;
    const currency = (s.currency ?? "").toUpperCase();
    const mapped: VerificationResult["status"] =
      s.payment_status === "paid" || s.payment_status === "no_payment_required"
        ? "success"
        : s.status === "expired"
          ? "abandoned"
          : s.status === "complete" && paymentIntentFailed(s)
            ? "failed"
            : // open, or complete with an asynchronous method (a bank
              // debit) still settling: not a decline yet.
              "pending";
    return {
      status: mapped,
      reference: s.id,
      amount: currency
        ? money(s.amount_total ?? 0, currency)
        : money(0, account.settlementCurrency),
      providerTransactionId: paymentIntentId(s),
      providerFee: null,
      channel: "card",
      customerEmail: s.customer_details?.email ?? s.customer_email ?? null,
      instrument: null,
      detail: s.status ?? null,
      raw: s,
    };
  },

  async refund(account, input): Promise<void> {
    let paymentIntent = input.providerTransactionId;
    if (!paymentIntent) {
      const v = await this.verify(account, input.reference);
      paymentIntent = v.providerTransactionId;
    }
    if (!paymentIntent) {
      throw new PaymentProviderError(
        "No PaymentIntent is recorded for this charge",
        "stripe",
      );
    }
    const body: Record<string, unknown> = { payment_intent: paymentIntent };
    if (input.amount && input.amount.amountMinor > 0)
      body.amount = input.amount.amountMinor;
    const { ok, status, json } = await call<unknown>(account, "/refunds", {
      method: "POST",
      body,
      idempotencyKey: `refund:${input.reference}:${input.amount?.amountMinor ?? "full"}`,
    });
    if (!ok) fail(json, "Refund failed", status);
  },

  parseWebhook(account, rawBody, headers): ParsedWebhook {
    const header = headers.get("stripe-signature");
    if (!header) return { ok: false, reason: "missing_signature" };
    // No secret configured here: nothing can be verified, so nothing is trusted.
    if (!account.credentials.webhookSecret)
      return { ok: false, reason: "invalid_signature" };
    const parts = Object.fromEntries(
      header.split(",").map((kv) => {
        const i = kv.indexOf("=");
        return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
      }),
    );
    const t = parts.t;
    const v1 = parts.v1;
    if (!t || !v1) return { ok: false, reason: "invalid_signature" };
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
    if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_S)
      return { ok: false, reason: "invalid_signature" };
    const expected = createHmac("sha256", account.credentials.webhookSecret)
      .update(`${t}.${rawBody}`)
      .digest("hex");
    const a = Buffer.from(v1, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b))
      return { ok: false, reason: "invalid_signature" };

    let body: {
      id?: string;
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: "malformed" };
    }
    const name = typeof body.type === "string" ? body.type : "";
    const obj = (body.data?.object ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    const num = (v: unknown) => (typeof v === "number" ? v : null);
    const piOf = (v: unknown) =>
      typeof v === "string"
        ? v
        : v && typeof v === "object"
          ? str((v as { id?: unknown }).id)
          : null;

    let event: NormalizedWebhookEvent;
    switch (name) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        // A completed session paid by an asynchronous method is not paid
        // yet; async_payment_succeeded / _failed follows.
        if (
          name === "checkout.session.completed" &&
          obj.payment_status !== "paid"
        ) {
          event = {
            type: "ignored",
            eventName: `${name}:${String(obj.payment_status)}`,
          };
          break;
        }
        event = {
          type: "payment.succeeded",
          reference: str(obj.id) ?? "",
          providerTransactionId: piOf(obj.payment_intent),
        };
        break;
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        event = {
          type: "payment.failed",
          reference: str(obj.id) ?? "",
          providerTransactionId: piOf(obj.payment_intent),
          detail: name,
        };
        break;
      case "charge.refunded": {
        const currency = str(obj.currency)?.toUpperCase();
        const amount = num(obj.amount_refunded);
        event = {
          type: "refund.processed",
          reference: null,
          providerTransactionId: piOf(obj.payment_intent),
          amount: currency && amount != null ? money(amount, currency) : null,
        };
        break;
      }
      case "refund.failed":
      case "charge.refund.updated": {
        const status = str(obj.status);
        if (name === "charge.refund.updated" && status !== "failed") {
          event = { type: "ignored", eventName: name };
          break;
        }
        event = {
          type: "refund.failed",
          providerTransactionId: piOf(obj.payment_intent),
          reference: null,
          detail: str(obj.failure_reason),
        };
        break;
      }
      case "charge.dispute.created":
      case "charge.dispute.updated":
      case "charge.dispute.closed": {
        const currency = str(obj.currency)?.toUpperCase();
        const amount = num(obj.amount);
        event = {
          type:
            name === "charge.dispute.created"
              ? "dispute.opened"
              : name === "charge.dispute.closed"
                ? "dispute.closed"
                : "dispute.updated",
          disputeId: str(obj.id) ?? "",
          reference: null,
          providerTransactionId: piOf(obj.payment_intent),
          amount: currency && amount != null ? money(amount, currency) : null,
          status: str(obj.status) ?? "unknown",
          resolution: null,
          raw: obj,
        };
        break;
      }
      default:
        event = { type: "ignored", eventName: name };
    }
    return {
      ok: true,
      eventId:
        str(body.id) ??
        createHmac("sha256", "stripe-event")
          .update(rawBody)
          .digest("hex")
          .slice(0, 32),
      eventName: name,
      event,
    };
  },

  async listMobileMoneyNetworks() {
    return [];
  },

  async listPayoutDestinations() {
    return [];
  },

  async createTransferRecipient() {
    unsupported("Transfer recipients (organizer payouts need Stripe Connect)");
  },

  async initiateTransfer() {
    unsupported("Transfers (organizer payouts need Stripe Connect)");
  },

  async probe(account) {
    try {
      const { ok, status, json } = await call<StripeError>(
        account,
        "/balance",
        { method: "GET" },
      );
      return ok
        ? { reachable: true }
        : {
            reachable: false,
            detail: json?.error?.message ?? `HTTP ${status}`,
          };
    } catch (error) {
      return {
        reachable: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

export function stripeMoney(m: Money): { amount: number; currency: string } {
  return { amount: m.amountMinor, currency: m.currency.toLowerCase() };
}
