// Raw Paystack HTTP calls, one function per endpoint, each taking the
// provider ACCOUNT whose secret key signs the request. This is the only
// module that talks to api.paystack.co; paystackProvider.ts maps these
// responses into Abonten's provider interface. Tests replace this module
// (vi.mock) and feed Paystack-shaped payloads, so nothing here should
// carry business logic.

import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";
import { z } from "zod";
import type { ProviderAccount } from "./types";
import { PaymentProviderError } from "./types";

const BASE_URL = "https://api.paystack.co";

const initializeSchema = z.object({
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
  bin: z.string().optional(),
  last4: z.string(),
  exp_month: z.string(),
  exp_year: z.string(),
  channel: z.string(),
  card_type: z.string(),
  bank: z.string().nullable(),
  reusable: z.boolean(),
});

const verifyDataSchema = z.object({
  id: z.number(),
  status: z.enum([
    "success",
    "failed",
    "abandoned",
    "pending",
    "queued",
    "reversed",
    "ongoing",
    "processing",
  ]),
  reference: z.string(),
  amount: z.number(),
  currency: z.string(),
  gateway_response: z.string().nullable().optional(),
  fees: z.number().nullable().optional(),
  paid_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  channel: z.string().nullable().optional(),
  metadata: z.unknown().optional(),
  customer: z
    .object({ email: z.string().nullable().optional() })
    .passthrough()
    .optional(),
  authorization: authorizationSchema.nullable().optional(),
});

const verifySchema = z.object({
  status: z.boolean(),
  message: z.string(),
  data: verifyDataSchema,
});

export type PaystackVerifyData = z.infer<typeof verifyDataSchema>;

const chargeDataSchema = z.object({
  reference: z.string(),
  status: z.enum([
    "success",
    "failed",
    "pending",
    "send_otp",
    "send_pin",
    "pay_offline",
    "open_url",
    "send_phone",
    "send_birthday",
    "send_address",
    "timeout",
    "processing",
  ]),
  message: z.string().nullable().optional(),
  display_text: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
});

const chargeSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  data: chargeDataSchema,
});

export type PaystackChargeData = z.infer<typeof chargeDataSchema>;

const bankListSchema = z.object({
  status: z.boolean(),
  data: z.array(
    z.object({
      name: z.string(),
      code: z.string(),
      type: z.string().nullable().optional(),
      currency: z.string().nullable().optional(),
    }),
  ),
});

export type PaystackBank = z.infer<typeof bankListSchema>["data"][number];

async function call<T>(
  account: ProviderAccount,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number },
): Promise<{ ok: boolean; status: number; json: T | null }> {
  const res = await fetchWithTimeout(`${BASE_URL}${path}`, {
    timeoutMs:
      init.timeoutMs ??
      (init.method === "GET"
        ? HTTP_TIMEOUTS.paystackRead
        : HTTP_TIMEOUTS.paystackWrite),
    method: init.method,
    headers: {
      Authorization: `Bearer ${account.credentials.secretKey}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await res.json().catch(() => null)) as T | null;
  return { ok: res.ok, status: res.status, json };
}

function fail(message: unknown, fallback: string, status?: number): never {
  throw new PaymentProviderError(
    typeof message === "string" ? message : fallback,
    "paystack",
    status,
  );
}

function messageOf(json: unknown): unknown {
  return (json as { message?: unknown } | null)?.message;
}

export async function initializeTransaction(
  account: ProviderAccount,
  params: {
    email: string;
    amountMinor: number;
    currency: string;
    reference: string;
    callbackUrl: string;
    metadata?: Record<string, unknown>;
    channels?: string[];
  },
): Promise<{
  reference: string;
  access_code: string;
  authorization_url: string;
}> {
  const { ok, status, json } = await call<unknown>(
    account,
    "/transaction/initialize",
    {
      method: "POST",
      body: {
        email: params.email,
        amount: params.amountMinor,
        currency: params.currency,
        reference: params.reference,
        callback_url: params.callbackUrl,
        metadata: params.metadata ?? {},
        ...(params.channels && params.channels.length > 0
          ? { channels: params.channels }
          : {}),
      },
    },
  );
  if (!ok) fail(messageOf(json), "Paystack initialization failed", status);
  const parsed = initializeSchema.safeParse(json);
  if (!parsed.success)
    fail(null, "Unexpected Paystack initialize response shape");
  if (!parsed.data.status)
    fail(parsed.data.message, "Paystack initialization failed");
  return parsed.data.data;
}

/**
 * A declined charge is a well-formed body on a non-2xx status: a business
 * outcome the caller reads from `status`, not an API failure.
 */
async function chargeCall(
  account: ProviderAccount,
  path: string,
  body: Record<string, unknown>,
  fallback: string,
): Promise<PaystackChargeData> {
  const { ok, status, json } = await call<unknown>(account, path, {
    method: "POST",
    body,
  });
  const parsed = chargeSchema.safeParse(json);
  if (parsed.success) return parsed.data.data;
  if (!ok) fail(messageOf(json), fallback, status);
  fail(null, "Unexpected Paystack charge response shape");
}

export function chargeAuthorization(
  account: ProviderAccount,
  params: {
    authorizationCode: string;
    email: string;
    amountMinor: number;
    currency: string;
    reference: string;
  },
): Promise<PaystackChargeData> {
  return chargeCall(
    account,
    "/transaction/charge_authorization",
    {
      authorization_code: params.authorizationCode,
      email: params.email,
      amount: params.amountMinor,
      currency: params.currency,
      reference: params.reference,
    },
    "Paystack charge failed",
  );
}

export function chargeMobileMoney(
  account: ProviderAccount,
  params: {
    email: string;
    amountMinor: number;
    currency: string;
    reference: string;
    phone: string;
    provider: string;
  },
): Promise<PaystackChargeData> {
  return chargeCall(
    account,
    "/charge",
    {
      email: params.email,
      amount: params.amountMinor,
      currency: params.currency,
      reference: params.reference,
      mobile_money: { phone: params.phone, provider: params.provider },
    },
    "Paystack mobile money charge failed",
  );
}

export async function submitOtp(
  account: ProviderAccount,
  params: { reference: string; otp: string },
): Promise<PaystackChargeData> {
  const { ok, status, json } = await call<unknown>(
    account,
    "/charge/submit_otp",
    { method: "POST", body: { otp: params.otp, reference: params.reference } },
  );
  if (!ok) fail(messageOf(json), "OTP submission failed", status);
  const parsed = chargeSchema.safeParse(json);
  if (!parsed.success) fail(null, "Unexpected Paystack charge response shape");
  return parsed.data.data;
}

export async function verifyTransaction(
  account: ProviderAccount,
  reference: string,
): Promise<PaystackVerifyData> {
  const { ok, status, json } = await call<unknown>(
    account,
    `/transaction/verify/${encodeURIComponent(reference)}`,
    { method: "GET" },
  );
  if (!ok) fail(messageOf(json), "Paystack verification failed", status);
  const parsed = verifySchema.safeParse(json);
  if (!parsed.success) fail(null, "Unexpected Paystack verify response shape");
  return parsed.data.data;
}

export async function refundTransaction(
  account: ProviderAccount,
  reference: string,
  amountMinor?: number | null,
): Promise<{ status: string }> {
  const { ok, status, json } = await call<{
    status?: boolean;
    data?: { status?: string };
  }>(account, "/refund", {
    method: "POST",
    body:
      amountMinor && amountMinor > 0
        ? { transaction: reference, amount: amountMinor }
        : { transaction: reference },
  });
  if (!ok) fail(messageOf(json), "Refund failed", status);
  return { status: json?.data?.status ?? "pending" };
}

export async function listBanks(
  account: ProviderAccount,
  query: string,
): Promise<PaystackBank[]> {
  const { ok, status, json } = await call<unknown>(account, `/bank?${query}`, {
    method: "GET",
  });
  if (!ok) fail(messageOf(json), "Failed to list banks", status);
  const parsed = bankListSchema.safeParse(json);
  if (!parsed.success)
    fail(null, "Unexpected Paystack list banks response shape");
  return parsed.data.data;
}

export async function createTransferRecipient(
  account: ProviderAccount,
  params: {
    type: string;
    name: string;
    accountNumber: string;
    bankCode: string;
    currency: string;
  },
): Promise<string> {
  const { ok, status, json } = await call<{
    status?: boolean;
    message?: string;
    data?: { recipient_code?: string };
  }>(account, "/transferrecipient", {
    method: "POST",
    body: {
      type: params.type,
      name: params.name,
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      currency: params.currency,
    },
  });
  const code = json?.data?.recipient_code;
  if (!ok || !json?.status || !code)
    fail(json?.message, "Failed to create transfer recipient", status);
  return code;
}

export async function initiateTransfer(
  account: ProviderAccount,
  params: {
    amountMinor: number;
    recipientCode: string;
    reference: string;
    reason: string;
  },
): Promise<{ transfer_code: string; status: string }> {
  const { ok, status, json } = await call<{
    status?: boolean;
    message?: string;
    data?: { transfer_code?: string; status?: string };
  }>(account, "/transfer", {
    method: "POST",
    body: {
      source: "balance",
      amount: params.amountMinor,
      recipient: params.recipientCode,
      reference: params.reference,
      reason: params.reason,
    },
  });
  const code = json?.data?.transfer_code;
  if (!ok || !json?.status || !code)
    fail(json?.message, "Failed to initiate transfer", status);
  return { transfer_code: code, status: json?.data?.status ?? "pending" };
}

export async function probeAccount(
  account: ProviderAccount,
): Promise<{ reachable: boolean; detail?: string }> {
  try {
    const { ok, status, json } = await call<{ message?: string }>(
      account,
      "/bank?perPage=1",
      { method: "GET" },
    );
    return ok
      ? { reachable: true }
      : { reachable: false, detail: json?.message ?? `HTTP ${status}` };
  } catch (error) {
    return {
      reachable: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
