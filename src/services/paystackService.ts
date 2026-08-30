// Small server-only wrapper around the two Paystack endpoints this app
// needs — matches this repo's src/services/ convention (plain exported
// async functions, local response types, plain fetch — see googleApi.ts/
// restCountriesApi.ts) rather than a bigger SDK-style abstraction.
//
// PAYSTACK_SECRET_KEY must never be imported into a "use client" file — this
// module is only ever called from Server Actions and the webhook route
// handler, both server-only execution contexts.

import type {
  PaystackBank,
  PaystackChargeResponse,
  PaystackInitializeResponse,
  PaystackVerifyResponse,
} from "@/types/paystackType";
import { z } from "zod";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error("Missing PAYSTACK_SECRET_KEY environment variable");
  }
  return key;
}

const initializeResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  data: z.object({
    authorization_url: z.string(),
    access_code: z.string(),
    reference: z.string(),
  }),
});

const authorizationSchema = z.object({
  authorization_code: z.string(),
  bin: z.string(),
  last4: z.string(),
  exp_month: z.string(),
  exp_year: z.string(),
  channel: z.string(),
  card_type: z.string(),
  bank: z.string().nullable(),
  reusable: z.boolean(),
});

const verifyResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  data: z.object({
    id: z.number(),
    status: z.enum([
      "success",
      "failed",
      "abandoned",
      "pending",
      "queued",
      "reversed",
    ]),
    reference: z.string(),
    amount: z.number(),
    currency: z.string(),
    gateway_response: z.string(),
    // Paystack's own processing fee for this charge, in the currency's
    // subunit (pesewas for GHS). Used to record Abonten's true net revenue
    // (service fee minus this) on platform_fee_entry. Not always present on
    // every channel/response, so treated as optional — a missing value means
    // "processing cost unknown", never assumed to be 0.
    fees: z.number().nullable().optional(),
    paid_at: z.string().nullable(),
    created_at: z.string(),
    channel: z.string(),
    // Paystack's shape for this field is inconsistent in practice (has been
    // observed as an object, null, and the bare number 0 for "no metadata
    // set") and it isn't read anywhere in this app — accept whatever comes
    // back rather than failing verification over it.
    metadata: z.unknown(),
    customer: z.object({ email: z.string() }),
    authorization: authorizationSchema.nullable().optional(),
  }),
});

const chargeResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  data: z.object({
    reference: z.string(),
    status: z.enum([
      "success",
      "failed",
      "pending",
      "send_otp",
      "send_pin",
      "pay_offline",
      "open_url",
    ]),
    message: z.string().nullable().optional(),
    display_text: z.string().nullable().optional(),
    amount: z.number().optional(),
    currency: z.string().optional(),
  }),
});

const listBanksResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  data: z.array(
    z.object({
      name: z.string(),
      code: z.string(),
      type: z.string(),
      currency: z.string(),
    }),
  ),
});

export class PaystackApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "PaystackApiError";
  }
}

type InitializeTransactionInput = {
  email: string;
  amountInPesewas: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  channels?: string[];
};

/**
 * Calls Paystack's Initialize Transaction endpoint. The server always
 * decides the amount (in pesewas) and reference passed here — callers must
 * never forward a client-supplied amount.
 */
export async function initializeTransaction(
  input: InitializeTransactionInput,
): Promise<PaystackInitializeResponse["data"]> {
  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountInPesewas,
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata ?? {},
      ...(input.channels ? { channels: input.channels } : {}),
    }),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new PaystackApiError(
      typeof json?.message === "string"
        ? json.message
        : "Paystack initialization failed",
      response.status,
    );
  }

  const parsed = initializeResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new PaystackApiError("Unexpected Paystack initialize response shape");
  }

  if (!parsed.data.status) {
    throw new PaystackApiError(parsed.data.message);
  }

  return parsed.data.data;
}

/**
 * Calls Paystack's Verify Transaction endpoint. This is the only source of
 * truth for whether a payment actually succeeded — callers must never treat
 * a client-side popup callback as sufficient on its own.
 */
export async function verifyTransaction(
  reference: string,
): Promise<PaystackVerifyResponse["data"]> {
  const response = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${getSecretKey()}`,
      },
    },
  );

  const json = await response.json();

  if (!response.ok) {
    throw new PaystackApiError(
      typeof json?.message === "string"
        ? json.message
        : "Paystack verification failed",
      response.status,
    );
  }

  const parsed = verifyResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new PaystackApiError("Unexpected Paystack verify response shape");
  }

  return parsed.data.data;
}

type ChargeAuthorizationInput = {
  authorizationCode: string;
  email: string;
  amountInPesewas: number;
  currency: string;
  reference: string;
};

/**
 * Charges a previously saved, reusable card authorization directly — no
 * popup, the shopper isn't involved at all. Only ever called with an
 * authorization_code this app itself captured and stored (see
 * confirmCardVerification.ts), never a client-supplied value.
 */
export async function chargeAuthorization(
  input: ChargeAuthorizationInput,
): Promise<PaystackChargeResponse["data"]> {
  const response = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/charge_authorization`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        authorization_code: input.authorizationCode,
        email: input.email,
        amount: input.amountInPesewas,
        currency: input.currency,
        reference: input.reference,
      }),
    },
  );

  const json = await response.json();

  // Paystack's charge endpoints return a well-formed {status, message, data}
  // body for declined/failed charges too — a non-2xx HTTP status here does
  // NOT necessarily mean the API call itself failed, only that the
  // underlying charge was declined. That's a normal business outcome
  // (data.status: "failed", with the real reason in data.message), not an
  // exception — so a body that parses successfully is trusted over the raw
  // HTTP status. Only a body that doesn't match the expected shape at all
  // (auth errors, rate limits, etc.) is treated as a hard failure.
  const parsed = chargeResponseSchema.safeParse(json);
  if (parsed.success) {
    return parsed.data.data;
  }

  if (!response.ok) {
    throw new PaystackApiError(
      typeof json?.message === "string"
        ? json.message
        : "Paystack charge failed",
      response.status,
    );
  }

  throw new PaystackApiError("Unexpected Paystack charge response shape");
}

type InitiateMobileMoneyChargeInput = {
  email: string;
  amountInPesewas: number;
  currency: string;
  reference: string;
  phone: string;
  providerCode: string;
};

/**
 * Initiates a direct Ghana mobile money charge (Paystack's Charge API), no
 * popup — the customer approves on their phone instead. Returns whatever
 * async status Paystack reports (`pay_offline`, `send_otp`, etc.); the
 * caller is responsible for polling/verifying, same as any other Paystack
 * transaction (see finalizePaystackPayment.ts).
 */
export async function initiateMobileMoneyCharge(
  input: InitiateMobileMoneyChargeInput,
): Promise<PaystackChargeResponse["data"]> {
  const response = await fetch(`${PAYSTACK_BASE_URL}/charge`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountInPesewas,
      currency: input.currency,
      reference: input.reference,
      mobile_money: {
        phone: input.phone,
        provider: input.providerCode,
      },
    }),
  });

  const json = await response.json();

  // See chargeAuthorization's comment above — a declined charge is a
  // well-formed, parseable response even on a non-2xx HTTP status, and is
  // trusted over the raw status code rather than treated as an exception.
  const parsed = chargeResponseSchema.safeParse(json);
  if (parsed.success) {
    return parsed.data.data;
  }

  if (!response.ok) {
    throw new PaystackApiError(
      typeof json?.message === "string"
        ? json.message
        : "Paystack mobile money charge failed",
      response.status,
    );
  }

  throw new PaystackApiError("Unexpected Paystack charge response shape");
}

/**
 * Submits an OTP for a pending charge that returned status "send_otp" — a
 * handful of Ghana mobile money charges still require this in addition to
 * the phone-prompt approval.
 */
export async function submitChargeOtp(
  otp: string,
  reference: string,
): Promise<PaystackChargeResponse["data"]> {
  const response = await fetch(`${PAYSTACK_BASE_URL}/charge/submit_otp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ otp, reference }),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new PaystackApiError(
      typeof json?.message === "string"
        ? json.message
        : "OTP submission failed",
      response.status,
    );
  }

  const parsed = chargeResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new PaystackApiError("Unexpected Paystack charge response shape");
  }

  return parsed.data.data;
}

/**
 * Lists Paystack's currently supported Ghana mobile money providers (List
 * Banks filtered to type=mobile_money) — the live source of truth for the
 * "select your network" dropdown, instead of a hardcoded guess at what
 * networks Paystack supports.
 */
export async function listMobileMoneyProviders(): Promise<PaystackBank[]> {
  const response = await fetch(
    `${PAYSTACK_BASE_URL}/bank?country=ghana&currency=GHS&type=mobile_money`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${getSecretKey()}`,
      },
    },
  );

  const json = await response.json();

  if (!response.ok) {
    throw new PaystackApiError(
      typeof json?.message === "string"
        ? json.message
        : "Failed to list mobile money providers",
      response.status,
    );
  }

  const parsed = listBanksResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new PaystackApiError("Unexpected Paystack list banks response shape");
  }

  return parsed.data.data;
}

/**
 * Refunds a Paystack transaction. Two callers:
 *   - confirmCardVerification.ts reverses the small card-verification charge
 *     in full (no `amountInPesewas`).
 *   - issueRefund.ts passes `amountInPesewas` to refund the ticket revenue
 *     only, deliberately keeping the customer-paid Abonten service fee (see
 *     the customer-paid-service-fee migration / issueRefund.ts).
 * Omitting `amountInPesewas` refunds the whole charge, which is Paystack's
 * own default when `amount` is not sent.
 */
export async function refundTransaction(
  reference: string,
  amountInPesewas?: number,
): Promise<void> {
  const response = await fetch(`${PAYSTACK_BASE_URL}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      amountInPesewas != null && amountInPesewas > 0
        ? { transaction: reference, amount: Math.round(amountInPesewas) }
        : { transaction: reference },
    ),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    throw new PaystackApiError(
      typeof json?.message === "string" ? json.message : "Refund failed",
      response.status,
    );
  }
}
