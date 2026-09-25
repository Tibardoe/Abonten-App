// The payment provider interface: what Abonten's payment core needs from any
// gateway, in Abonten's own terms. Provider SDK shapes never leave their
// adapter (paystackProvider.ts, stripeProvider.ts); the checkout, the
// finalizer, refunds, payouts and the webhook handler depend only on this.
//
// A ProviderAccount is one provider ACCOUNT for one market — the same
// adapter serves Ghana's Paystack business and Nigeria's, each with its own
// secret key, webhook secret, settlement currency and accepted currencies.
// Credentials are read from the environment by name at resolution time
// (see registry.ts) and are never stored.

import type {
  PaymentMethodCode,
  PaymentProviderCode,
} from "@abonten/core/market/types";
import type { Money } from "@abonten/core/money/money";

export type ProviderCredentials = {
  secretKey: string;
  webhookSecret: string;
  /** For client-side SDKs (Paystack inline, Stripe.js); safe to expose. */
  publicKey: string | null;
};

export type ProviderAccount = {
  provider: PaymentProviderCode;
  countryCode: string;
  credentials: ProviderCredentials;
  settlementCurrency: string;
  currencies: string[];
  payoutsEnabled: boolean;
  /** Provider-side identifier for logs and reconciliation (never a secret). */
  accountRef: string | null;
};

export type ProviderCapabilities = {
  /** Which of Abonten's payment method codes this adapter can run. */
  methods: PaymentMethodCode[];
  /** Cards can be tokenised for direct charges later. */
  savedCards: boolean;
  /** Mobile money can be charged directly (no hosted page). */
  directMobileMoney: boolean;
  refunds: boolean;
  partialRefunds: boolean;
  /** The adapter can move money to organizers (transfers / payouts). */
  payouts: boolean;
  /** Hosted page ("redirect") vs in-page overlay ("popup"). */
  checkoutModes: ("popup" | "redirect")[];
  /** The provider reports its own fee on a verified charge. */
  reportsProcessingFee: boolean;
  /** The provider notifies charge outcomes by webhook. */
  webhooks: boolean;
};

/** How the client should continue after the server started a payment. */
export type CheckoutInit =
  | {
      mode: "popup";
      reference: string;
      accessCode: string;
      authorizationUrl: string;
      /** The provider public key the client SDK must use for this market. */
      publicKey: string | null;
      provider: PaymentProviderCode;
    }
  | {
      mode: "redirect";
      reference: string;
      url: string;
      provider: PaymentProviderCode;
    }
  | {
      mode: "direct";
      reference: string;
      chargeStatus: string;
      displayMessage?: string;
      provider: PaymentProviderCode;
    };

export type InitializeCheckoutInput = {
  email: string;
  amount: Money;
  reference: string;
  callbackUrl: string;
  /** Free-form, echoed back on verification and webhooks. */
  metadata?: Record<string, unknown>;
  /** Restrict the hosted page to these Abonten method codes. */
  methods?: PaymentMethodCode[];
  /** A line the hosted page can show ("2 × General admission"). */
  description?: string;
};

export type ChargeSavedCardInput = {
  email: string;
  amount: Money;
  reference: string;
  /** The reusable token the adapter captured at verification time. */
  token: string;
};

export type ChargeMobileMoneyInput = {
  email: string;
  amount: Money;
  reference: string;
  phoneE164: string;
  /** Provider-specific network code (from listMobileMoneyNetworks). */
  networkCode: string;
};

export type SavedInstrument = {
  kind: "card";
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  token: string;
  bank: string | null;
  reusable: boolean;
};

export type VerificationStatus = "success" | "pending" | "failed" | "abandoned";

export type VerificationResult = {
  status: VerificationStatus;
  reference: string;
  amount: Money;
  /** The provider's own charge id (Paystack numeric id, Stripe payment_intent). */
  providerTransactionId: string | null;
  /** The provider's fee for this charge, when reported. */
  providerFee: Money | null;
  channel: string | null;
  customerEmail: string | null;
  instrument: SavedInstrument | null;
  /** The provider's message for a decline/abandon, for support. */
  detail: string | null;
  raw: unknown;
};

export type MobileMoneyNetwork = { code: string; name: string };

export type PayoutDestination = {
  code: string;
  name: string;
  type: "bank" | "mobile_money";
};

export type TransferRecipientInput = {
  method: "bank" | "mobile_money";
  name: string;
  accountNumber: string;
  destinationCode: string;
  currency: string;
};

export type TransferInput = {
  amount: Money;
  recipientCode: string;
  reference: string;
  reason: string;
};

/** Provider webhooks, normalised. */
export type NormalizedWebhookEvent =
  | {
      type: "payment.succeeded";
      reference: string;
      providerTransactionId: string | null;
    }
  | {
      type: "payment.failed";
      reference: string;
      providerTransactionId: string | null;
      detail: string | null;
    }
  | {
      type: "refund.processed";
      reference: string | null;
      providerTransactionId: string | null;
      amount: Money | null;
    }
  | {
      type: "refund.failed";
      reference: string | null;
      providerTransactionId: string | null;
      detail: string | null;
    }
  | {
      type: "dispute.opened" | "dispute.updated" | "dispute.closed";
      disputeId: string;
      reference: string | null;
      providerTransactionId: string | null;
      amount: Money | null;
      status: string;
      resolution: string | null;
      raw: unknown;
    }
  | {
      type: "transfer.success" | "transfer.failed" | "transfer.reversed";
      transferCode: string;
      detail: string | null;
    }
  | { type: "ignored"; eventName: string };

export type ParsedWebhook =
  | {
      ok: true;
      eventId: string;
      eventName: string;
      event: NormalizedWebhookEvent;
    }
  | {
      ok: false;
      reason: "missing_signature" | "invalid_signature" | "malformed";
    };

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: PaymentProviderCode,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

export interface PaymentProvider {
  readonly code: PaymentProviderCode;
  capabilities(account: ProviderAccount): ProviderCapabilities;
  /** Which Abonten method codes this account can run for a currency. */
  supportsMethod(
    account: ProviderAccount,
    method: PaymentMethodCode,
    currency: string,
  ): boolean;
  /** The small charge used to tokenise a card, in the account's currency. */
  cardVerificationAmount(
    account: ProviderAccount,
    currency: string,
  ): Money | null;

  initializeCheckout(
    account: ProviderAccount,
    input: InitializeCheckoutInput,
  ): Promise<CheckoutInit>;
  chargeSavedCard(
    account: ProviderAccount,
    input: ChargeSavedCardInput,
  ): Promise<CheckoutInit>;
  chargeMobileMoney(
    account: ProviderAccount,
    input: ChargeMobileMoneyInput,
  ): Promise<CheckoutInit>;
  submitOtp(
    account: ProviderAccount,
    reference: string,
    otp: string,
  ): Promise<CheckoutInit>;

  verify(
    account: ProviderAccount,
    reference: string,
  ): Promise<VerificationResult>;
  refund(
    account: ProviderAccount,
    input: {
      reference: string;
      providerTransactionId: string | null;
      amount?: Money | null;
    },
  ): Promise<void>;

  parseWebhook(
    account: ProviderAccount,
    rawBody: string,
    headers: Headers,
  ): ParsedWebhook;

  listMobileMoneyNetworks(
    account: ProviderAccount,
    currency: string,
  ): Promise<MobileMoneyNetwork[]>;
  listPayoutDestinations(
    account: ProviderAccount,
    currency: string,
    type: "bank" | "mobile_money",
  ): Promise<PayoutDestination[]>;
  createTransferRecipient(
    account: ProviderAccount,
    input: TransferRecipientInput,
  ): Promise<string>;
  initiateTransfer(
    account: ProviderAccount,
    input: TransferInput,
  ): Promise<{ transferCode: string; status: string }>;

  /** A cheap authenticated call proving the credentials work. */
  probe(
    account: ProviderAccount,
  ): Promise<{ reachable: boolean; detail?: string }>;
}
