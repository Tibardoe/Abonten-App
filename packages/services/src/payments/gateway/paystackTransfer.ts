import { logger } from "@abonten/core/logger";
import { PaystackApiError } from "./paystackService";

// Paystack Transfers API — the piece that makes an organizer payout
// actually move money instead of only being recorded.
//
// GATED OFF BY DEFAULT. Nothing here runs unless PAYSTACK_TRANSFERS_ENABLED
// is exactly "true" AND the Paystack account has Transfers enabled with a
// secret key that carries the transfer permission. With the flag unset the
// manual flow (admin creates payout → sends funds out-of-band →
// admin_settle_payout) is completely unchanged.
//
// Flow: resolve the destination bank/mobile-money code from the
// payout_account's free-text `provider`, create (or reuse) a transfer
// recipient, then initiate a transfer. The `payout` row is NOT marked
// completed here — that happens when the transfer.success webhook lands.

const PAYSTACK_BASE_URL = "https://api.paystack.co";

export function paystackTransfersEnabled(): boolean {
  return process.env.PAYSTACK_TRANSFERS_ENABLED === "true";
}

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Missing PAYSTACK_SECRET_KEY environment variable");
  return key;
}

async function paystackFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: unknown;
  } | null;
  if (!res.ok || !json?.status) {
    throw new PaystackApiError(
      json?.message ?? `Paystack ${path} failed`,
      res.status,
    );
  }
  return json.data as T;
}

type BankListEntry = { name: string; code: string; type?: string };

// Paystack's Ghana bank/MoMo list rarely changes; cache it for the process.
let bankListCache: { at: number; banks: BankListEntry[] } | null = null;
const BANK_LIST_TTL_MS = 30 * 60 * 1000;

async function getGhanaBankList(): Promise<BankListEntry[]> {
  if (bankListCache && Date.now() - bankListCache.at < BANK_LIST_TTL_MS) {
    return bankListCache.banks;
  }
  const banks = await paystackFetch<BankListEntry[]>(
    "/bank?currency=GHS&perPage=200",
    { method: "GET" },
  );
  bankListCache = { at: Date.now(), banks };
  return banks;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Maps the payout_account's free-text `provider` (e.g. "MTN", "Vodafone
 * Cash", "GCB Bank") to a Paystack transfer destination code. Throws a
 * user-safe error if it can't — better to fall back to manual settlement
 * than to send money to the wrong place.
 */
export async function resolvePaystackDestination(input: {
  provider: string | null;
  accountType: "mobile_money" | "bank";
}): Promise<{ recipientType: "mobile_money" | "nuban"; bankCode: string }> {
  if (!input.provider) {
    throw new PaystackApiError(
      "This payout account has no provider set — settle it manually.",
    );
  }
  const banks = await getGhanaBankList();
  const wantMomo = input.accountType === "mobile_money";
  const target = norm(input.provider);

  const candidates = banks.filter((b) =>
    wantMomo
      ? (b.type ?? "").includes("mobile")
      : (b.type ?? "nuban") === "nuban" || !b.type,
  );
  const hit =
    candidates.find((b) => norm(b.name) === target) ??
    candidates.find(
      (b) => norm(b.name).includes(target) || target.includes(norm(b.name)),
    );

  if (!hit) {
    throw new PaystackApiError(
      `Couldn't map "${input.provider}" to a Paystack ${
        wantMomo ? "mobile-money" : "bank"
      } destination — settle this payout manually.`,
    );
  }
  return {
    recipientType: wantMomo ? "mobile_money" : "nuban",
    bankCode: hit.code,
  };
}

export async function createTransferRecipient(input: {
  recipientType: "mobile_money" | "nuban";
  name: string;
  accountNumber: string;
  bankCode: string;
  currency: string;
}): Promise<string> {
  const data = await paystackFetch<{ recipient_code: string }>(
    "/transferrecipient",
    {
      method: "POST",
      body: JSON.stringify({
        type: input.recipientType,
        name: input.name,
        account_number: input.accountNumber,
        bank_code: input.bankCode,
        currency: input.currency,
      }),
    },
  );
  return data.recipient_code;
}

export async function initiatePaystackTransfer(input: {
  amountPesewas: number;
  recipientCode: string;
  reference: string;
  reason: string;
}): Promise<{ transferCode: string; status: string }> {
  const data = await paystackFetch<{ transfer_code: string; status: string }>(
    "/transfer",
    {
      method: "POST",
      body: JSON.stringify({
        source: "balance",
        amount: input.amountPesewas,
        recipient: input.recipientCode,
        reference: input.reference,
        reason: input.reason,
      }),
    },
  );
  logger.info(
    `Paystack transfer initiated: ${data.transfer_code} (${data.status}) for ${input.reference}`,
  );
  return { transferCode: data.transfer_code, status: data.status };
}
