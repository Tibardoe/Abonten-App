// Paystack adapter. One adapter serves every Paystack business Abonten
// holds (Ghana, Nigeria, Kenya, South Africa, Côte d'Ivoire): the account's
// secret key comes in with every call, nothing is read from a fixed env
// name here. Amounts go to Paystack as integers in the currency's minor
// unit, which is what `Money.amountMinor` already is.
//
// Paystack facts this adapter encodes (paystack.com/docs):
//   * accepted currencies per business country: GHS+USD (GH), NGN+USD (NG),
//     KES+USD (KE), ZAR+USD (ZA), XOF (CI) — configured per market row.
//   * channels: card everywhere; mobile_money GH/KE/CI; bank_transfer, ussd,
//     qr, bank (redirect) NG; eft ZA. The market's payment method rows name
//     the channels; this adapter maps Abonten codes to them.
//   * a verified charge reports `fees` (the provider's own fee, minor units).
//   * refunds: full or partial, asynchronous (refund.processed webhook).
//   * transfers (payouts): recipient + transfer, outcome by webhook.

import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "@abonten/core/logger";
import type { PaymentMethodCode } from "@abonten/core/market/types";
import { type Money, money } from "@abonten/core/money/money";
import * as api from "./paystackApi";
import type { PaystackChargeData } from "./paystackApi";
import type {
  ChargeMobileMoneyInput,
  ChargeSavedCardInput,
  CheckoutInit,
  InitializeCheckoutInput,
  MobileMoneyNetwork,
  NormalizedWebhookEvent,
  ParsedWebhook,
  PaymentProvider,
  PayoutDestination,
  ProviderAccount,
  ProviderCapabilities,
  TransferInput,
  TransferRecipientInput,
  VerificationResult,
} from "./types";

/** Abonten method code -> Paystack channel. */
const CHANNEL_FOR_METHOD: Partial<Record<PaymentMethodCode, string>> = {
  card: "card",
  mobile_money: "mobile_money",
  bank_transfer: "bank_transfer",
  bank_redirect: "bank",
  ussd: "ussd",
  qr: "qr",
  eft: "eft",
  apple_pay: "apple_pay",
};

/** Channels Paystack offers per business country (documented availability). */
const CHANNELS_BY_COUNTRY: Record<string, string[]> = {
  GH: ["card", "mobile_money"],
  NG: ["card", "bank", "bank_transfer", "ussd", "qr", "apple_pay"],
  KE: ["card", "mobile_money"],
  ZA: ["card", "eft", "apple_pay"],
  CI: ["card", "mobile_money"],
};

/** The tokenisation charge (refunded at once) per currency, in minor units. */
const CARD_VERIFICATION_MINOR: Record<string, number> = {
  GHS: 100,
  NGN: 5000,
  KES: 1000,
  ZAR: 100,
  XOF: 100,
  USD: 100,
};

/** Paystack's `country` query value for bank listing, per market. */
const BANK_COUNTRY: Record<string, string> = {
  GH: "ghana",
  NG: "nigeria",
  KE: "kenya",
  ZA: "south africa",
  CI: "côte d'ivoire",
};

function chargeInit(data: PaystackChargeData): CheckoutInit {
  return {
    mode: "direct",
    provider: "paystack",
    reference: data.reference,
    chargeStatus: data.status,
    displayMessage: data.message ?? data.display_text ?? undefined,
  };
}

function toMinorAmount(m: Money): number {
  return m.amountMinor;
}

export const paystackProvider: PaymentProvider = {
  code: "paystack",

  capabilities(account): ProviderCapabilities {
    const channels = CHANNELS_BY_COUNTRY[account.countryCode] ?? ["card"];
    const methods = (
      Object.keys(CHANNEL_FOR_METHOD) as PaymentMethodCode[]
    ).filter((m) => channels.includes(CHANNEL_FOR_METHOD[m] as string));
    return {
      methods,
      savedCards: true,
      directMobileMoney: channels.includes("mobile_money"),
      refunds: true,
      partialRefunds: true,
      payouts: account.payoutsEnabled,
      checkoutModes: ["popup"],
      reportsProcessingFee: true,
      webhooks: true,
    };
  },

  supportsMethod(account, method, currency) {
    const channel = CHANNEL_FOR_METHOD[method];
    if (!channel) return false;
    const channels = CHANNELS_BY_COUNTRY[account.countryCode] ?? ["card"];
    if (!channels.includes(channel)) return false;
    // Local rails only run in the local currency; cards take every
    // currency the business accepts.
    if (
      method !== "card" &&
      currency.toUpperCase() !== account.settlementCurrency.toUpperCase()
    )
      return false;
    return account.currencies
      .map((c) => c.toUpperCase())
      .includes(currency.toUpperCase());
  },

  cardVerificationAmount(_account, currency) {
    const minor = CARD_VERIFICATION_MINOR[currency.toUpperCase()];
    return minor ? money(minor, currency) : null;
  },

  async initializeCheckout(account, input): Promise<CheckoutInit> {
    const channels = input.methods
      ?.map((m) => CHANNEL_FOR_METHOD[m])
      .filter((c): c is string => !!c);
    const data = await api.initializeTransaction(account, {
      email: input.email,
      amountMinor: toMinorAmount(input.amount),
      currency: input.amount.currency,
      reference: input.reference,
      callbackUrl: input.callbackUrl,
      metadata: input.metadata ?? {},
      channels,
    });
    return {
      mode: "popup",
      provider: "paystack",
      reference: data.reference,
      accessCode: data.access_code,
      authorizationUrl: data.authorization_url,
      publicKey: account.credentials.publicKey,
    };
  },

  async chargeSavedCard(
    account,
    input: ChargeSavedCardInput,
  ): Promise<CheckoutInit> {
    return chargeInit(
      await api.chargeAuthorization(account, {
        authorizationCode: input.token,
        email: input.email,
        amountMinor: toMinorAmount(input.amount),
        currency: input.amount.currency,
        reference: input.reference,
      }),
    );
  },

  async chargeMobileMoney(
    account,
    input: ChargeMobileMoneyInput,
  ): Promise<CheckoutInit> {
    return chargeInit(
      await api.chargeMobileMoney(account, {
        email: input.email,
        amountMinor: toMinorAmount(input.amount),
        currency: input.amount.currency,
        reference: input.reference,
        phone: input.phoneE164,
        provider: input.networkCode,
      }),
    );
  },

  async submitOtp(account, reference, otp): Promise<CheckoutInit> {
    return chargeInit(await api.submitOtp(account, { reference, otp }));
  },

  async verify(account, reference): Promise<VerificationResult> {
    const d = await api.verifyTransaction(account, reference);
    const currency = d.currency.toUpperCase();
    const mapped: VerificationResult["status"] =
      d.status === "success"
        ? "success"
        : d.status === "abandoned"
          ? "abandoned"
          : d.status === "pending" ||
              d.status === "queued" ||
              d.status === "ongoing" ||
              d.status === "processing"
            ? "pending"
            : "failed";
    const auth = d.authorization;
    return {
      status: mapped,
      reference: d.reference,
      amount: money(d.amount, currency),
      providerTransactionId: String(d.id),
      providerFee: d.fees != null ? money(d.fees, currency) : null,
      channel: d.channel ?? null,
      customerEmail: d.customer?.email ?? null,
      instrument:
        auth && auth.channel === "card"
          ? {
              kind: "card",
              brand: auth.card_type,
              last4: auth.last4,
              expiryMonth: Number(auth.exp_month),
              expiryYear: Number(auth.exp_year),
              token: auth.authorization_code,
              bank: auth.bank,
              reusable: auth.reusable,
            }
          : null,
      detail: d.gateway_response ?? null,
      raw: d,
    };
  },

  async refund(account, input): Promise<void> {
    await api.refundTransaction(
      account,
      input.reference,
      input.amount && input.amount.amountMinor > 0
        ? toMinorAmount(input.amount)
        : null,
    );
  },

  parseWebhook(account, rawBody, headers): ParsedWebhook {
    const signature = headers.get("x-paystack-signature");
    if (!signature) return { ok: false, reason: "missing_signature" };
    // No secret configured here: nothing can be verified, so nothing is trusted.
    if (!account.credentials.webhookSecret)
      return { ok: false, reason: "invalid_signature" };
    const expected = createHmac("sha512", account.credentials.webhookSecret)
      .update(rawBody)
      .digest("hex");
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b))
      return { ok: false, reason: "invalid_signature" };

    let body: { event?: string; data?: Record<string, unknown> };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: "malformed" };
    }
    const name = typeof body.event === "string" ? body.event : "";
    const data = (body.data ?? {}) as Record<string, unknown>;
    const reference =
      typeof data.reference === "string" ? data.reference : null;
    const id = data.id != null ? String(data.id) : null;
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    const num = (v: unknown) => (typeof v === "number" ? v : null);
    // Paystack has no event id; a hash of the payload identifies a delivery.
    const eventId = createHmac("sha256", "paystack-event")
      .update(rawBody)
      .digest("hex")
      .slice(0, 32);

    let event: NormalizedWebhookEvent;
    switch (name) {
      case "charge.success":
        event = {
          type: "payment.succeeded",
          reference: reference ?? "",
          providerTransactionId: id,
        };
        break;
      case "charge.failed":
      case "charge.abandoned":
        event = {
          type: "payment.failed",
          reference: reference ?? "",
          providerTransactionId: id,
          detail: str(data.gateway_response),
        };
        break;
      case "refund.processed": {
        const txRef =
          str(data.transaction_reference) ??
          str(
            (data.transaction as Record<string, unknown> | undefined)
              ?.reference,
          ) ??
          reference;
        const currency = str(data.currency);
        const amount = num(data.amount);
        event = {
          type: "refund.processed",
          reference: txRef,
          providerTransactionId: null,
          amount: currency && amount != null ? money(amount, currency) : null,
        };
        break;
      }
      case "refund.failed": {
        const txRef =
          str(data.transaction_reference) ??
          str(
            (data.transaction as Record<string, unknown> | undefined)
              ?.reference,
          ) ??
          reference;
        event = {
          type: "refund.failed",
          reference: txRef,
          providerTransactionId: null,
          detail: str(data.message),
        };
        break;
      }
      case "charge.dispute.create":
      case "charge.dispute.remind":
      case "charge.dispute.resolve": {
        const tx =
          (data.transaction as Record<string, unknown> | undefined) ?? {};
        const currency = str(data.currency) ?? str(tx.currency);
        const amount = num(data.refund_amount) ?? num(tx.amount);
        event = {
          type:
            name === "charge.dispute.create"
              ? "dispute.opened"
              : name === "charge.dispute.resolve"
                ? "dispute.closed"
                : "dispute.updated",
          disputeId: String(data.id ?? ""),
          reference: str(tx.reference),
          providerTransactionId: tx.id != null ? String(tx.id) : null,
          amount: currency && amount != null ? money(amount, currency) : null,
          status: str(data.status) ?? "unknown",
          resolution: str(data.resolution),
          raw: data,
        };
        break;
      }
      case "transfer.success":
      case "transfer.failed":
      case "transfer.reversed":
        event = {
          type: name,
          transferCode: str(data.transfer_code) ?? "",
          detail: str(data.reason),
        };
        break;
      default:
        event = { type: "ignored", eventName: name };
    }
    return { ok: true, eventId, eventName: name, event };
  },

  async listMobileMoneyNetworks(
    account,
    currency,
  ): Promise<MobileMoneyNetwork[]> {
    const country = BANK_COUNTRY[account.countryCode];
    const banks = await api.listBanks(
      account,
      `${country ? `country=${encodeURIComponent(country)}&` : ""}currency=${encodeURIComponent(currency)}&type=mobile_money`,
    );
    return banks.map((b) => ({ code: b.code, name: b.name }));
  },

  async listPayoutDestinations(
    account,
    currency,
    type,
  ): Promise<PayoutDestination[]> {
    const banks = await api.listBanks(
      account,
      `currency=${encodeURIComponent(currency)}&perPage=200${type === "mobile_money" ? "&type=mobile_money" : ""}`,
    );
    return banks
      .filter((b) =>
        type === "mobile_money"
          ? (b.type ?? "").includes("mobile")
          : !(b.type ?? "").includes("mobile"),
      )
      .map((b) => ({ code: b.code, name: b.name, type }));
  },

  async createTransferRecipient(
    account,
    input: TransferRecipientInput,
  ): Promise<string> {
    return api.createTransferRecipient(account, {
      type:
        input.method === "mobile_money"
          ? "mobile_money"
          : account.countryCode === "GH"
            ? "ghipss"
            : account.countryCode === "ZA"
              ? "basa"
              : account.countryCode === "KE"
                ? "kepss"
                : "nuban",
      name: input.name,
      accountNumber: input.accountNumber,
      bankCode: input.destinationCode,
      currency: input.currency,
    });
  },

  async initiateTransfer(account, input: TransferInput) {
    const res = await api.initiateTransfer(account, {
      amountMinor: toMinorAmount(input.amount),
      recipientCode: input.recipientCode,
      reference: input.reference,
      reason: input.reason,
    });
    logger.info(
      `Paystack transfer initiated: ${res.transfer_code} (${res.status}) for ${input.reference}`,
    );
    return { transferCode: res.transfer_code, status: res.status };
  },

  async probe(account) {
    return api.probeAccount(account);
  },
};
