// Hand-written types for Paystack API shapes this app actually uses
// (Initialize/Verify Transaction, the charge.success webhook event) —
// matches this repo's convention of precisely typing new external/RPC
// response shapes (see src/types/transactions.ts) rather than using `any`.
// Runtime-validated with zod in src/services/paystackService.ts, since
// external API responses aren't trusted as pre-typed.

export type PaymentAttemptStatus =
  | "initiated"
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "refunded";

export type PaystackInitializeResponse = {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
};

export type PaystackAuthorization = {
  authorization_code: string;
  bin: string;
  last4: string;
  exp_month: string;
  exp_year: string;
  channel: string;
  card_type: string;
  bank: string | null;
  reusable: boolean;
};

export type PaystackVerifyResponse = {
  status: boolean;
  message: string;
  data: {
    id: number;
    status:
      | "success"
      | "failed"
      | "abandoned"
      | "pending"
      | "queued"
      | "reversed";
    reference: string;
    amount: number;
    currency: string;
    gateway_response: string;
    // Paystack's own processing fee for this charge, in the currency's
    // subunit (pesewas for GHS). Recorded as platform_fee_entry.processing_cost
    // so Abonten's true net revenue (service fee minus this) is auditable.
    // Optional/nullable — not every channel/response includes it, and a
    // missing value means "unknown", never assumed to be 0.
    fees?: number | null;
    paid_at: string | null;
    created_at: string;
    channel: string;
    // See paystackService.ts's verifyResponseSchema comment — Paystack's
    // shape for this field is inconsistent in practice and it isn't read
    // anywhere in this app. Optional because zod infers z.unknown() object
    // properties as possibly-absent.
    metadata?: unknown;
    customer: {
      email: string;
    };
    authorization?: PaystackAuthorization | null;
  };
};

export type PaystackWebhookEvent = {
  event: string;
  data: PaystackVerifyResponse["data"];
};

// Response shape of POST /charge (direct mobile money / other non-popup
// charges) and POST /transaction/charge_authorization (charging a saved
// card's authorization_code). Both return the same "status" discriminator
// Paystack uses across its async payment flows.
export type PaystackChargeResponse = {
  status: boolean;
  message: string;
  data: {
    reference: string;
    status:
      | "success"
      | "failed"
      | "pending"
      | "send_otp"
      | "send_pin"
      | "pay_offline"
      | "open_url";
    // Paystack's data.message carries the actual outcome/decline reason —
    // the top-level `message` above is a generic "Charge attempted" for
    // both success and failure on this endpoint, so this is what should
    // actually be shown to the user. Paystack sends an explicit `null`
    // here (not just omits the field) on a successful charge.
    message?: string | null;
    display_text?: string | null;
    amount?: number;
    currency?: string;
  };
};

// Shape of the refund.processed / refund.failed webhook events. Paystack's
// official docs are unreachable from this environment (403), and community
// sources disagree on whether the transaction reference is a flat
// `transaction_reference` field or nested under `transaction.reference` —
// every field here is optional so the webhook handler can check all of them
// defensively instead of assuming one and silently missing refund
// confirmations if the assumption is wrong.
export type PaystackRefundWebhookData = {
  id?: number;
  status?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  transaction_reference?: string;
  transaction?: { reference?: string } | null;
};

export type PaystackBank = {
  name: string;
  code: string;
  type: string;
  currency: string;
};

export type PaystackListBanksResponse = {
  status: boolean;
  message: string;
  data: PaystackBank[];
};
