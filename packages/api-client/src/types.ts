import type { NotificationType } from "@abonten/types/notificationType";
import type {
  OrganizerFinanceOverviewRow,
  OrganizerLedgerTransactionRow,
  OrganizerPayoutRow,
  PayoutAccountRow,
  PayoutAccountType,
  PayoutStatus,
} from "@abonten/types/organizerFinance";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { UserPostType } from "@abonten/types/postsType";

// Every mobile API route replies with this envelope (mirrors the web Server
// Action convention). The HTTP status code always equals `status`.
export type ApiEnvelope<T> = {
  status: number;
  message?: string;
  data?: T;
};

export type {
  NotificationType,
  OrganizerFinanceOverviewRow,
  OrganizerLedgerTransactionRow,
  OrganizerPayoutRow,
  PaginatedResult,
  PayoutAccountRow,
  PayoutAccountType,
  PayoutStatus,
  UserPostType,
};

// ---- auth ----------------------------------------------------------------

export type RequestPhoneOtpBody = {
  dialCode: string;
  rawPhone: string;
};

export type RequestPhoneOtpData = {
  phoneE164: string;
};

export type VerifyPhoneOtpBody = {
  phoneE164: string;
  code: string;
};

export type PhoneSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in: number;
  token_type: string;
  user: { id?: string; phone?: string };
  isNewUser: boolean;
};

// ---- uploads ------------------------------------------------------------

export type UploadSignatureKind =
  | "avatar"
  | "highlight"
  | "place_photo"
  | "event_review_photo"
  | "place_review_photo";

export type CloudinarySignatureData = {
  timestamp: number;
  signature: string;
  apiKey: string | undefined;
  cloudName: string | undefined;
  folder: string;
};

// ---- profile ---------------------------------------------------------------

// The profile route returns the `user_profile_details` view row as-is; its
// column set is broad and DB-driven, so it is intentionally left loose here.
export type ProfileData = Record<string, unknown>;

// ---- checkout -------------------------------------------------------------

export type ValidateCheckoutBody = {
  eventId: string;
  quantities: Record<string, number>;
  occurrenceId?: string | null;
  // Optional promo code — validated + claimed server-side inside
  // validateCheckoutCore. A bad code fails the whole validate call with its
  // own message (e.g. "Promo code is invalid!").
  promoCode?: string | null;
};

// validateCheckoutCore replies flat (not wrapped in `data`): 200 carries
// `checkoutSessionId`; 300 carries `reason` + (for a pending checkout)
// `checkoutId`; other statuses carry `message`.
export type ValidateCheckoutResult = {
  status: number;
  message?: string;
  checkoutSessionId?: string;
  reason?: "pending_checkout" | "already_purchased";
  checkoutId?: string;
};

// One-click RSVP for a free event (registerForFreeEventCore). Flat reply:
// 200 = registered; 300 = already have a ticket; 404 = no free
// registration; 409 = not accepting / ended; 400 = bad occurrence.
export type FreeRsvpBody = {
  eventId: string;
  occurrenceId?: string | null;
};

export type FreeRsvpResult = { status: number; message?: string };

// ---- ticket cancellation --------------------------------------------------
// cancelUserTicketCore. Pass transactionId (from the ticket row) for a paid
// ticket so the refund can be gated; null/omitted for a free one. Flat
// reply: 200 = cancelled (message says whether a refund was requested or
// deferred); 404 = not the caller's ticket.
export type CancelTicketBody = {
  ticketId: string;
  transactionId?: string | null;
};

export type CancelTicketResult = { status: number; message?: string };

export type PreparedCheckoutSession = {
  checkoutSessionId: string;
  eventTitle: string;
  subtotal: number;
  discount: number;
  fee: number;
  total: number;
};

export type PreparedCheckoutPayment = {
  validSessions: PreparedCheckoutSession[];
  invalidSessionIds: string[];
  grandTotal: number;
  currency: string;
};

// One `ticket_checkout` row joined with its event + ticket type. The select
// is `*, event(...), ticket_type(...)` — broad and DB-driven, kept loose.
export type CheckoutSessionRow = Record<string, unknown>;

// ---- pending-checkout basket -------------------------------------------
// Mirrors getUserPendingTicketCheckoutsCore's PendingCheckoutSession /
// PendingCheckoutSessionLine. `GET /api/mobile/checkout/pending` returns
// `ApiEnvelope<PendingCheckoutSession[]>`.

export type PendingCheckoutSessionLine = {
  ticketCheckoutId: string;
  ticketTypeId: string;
  type: string;
  unitPrice: number;
  quantity: number;
  discount: number;
  discountedUnits: number;
  amount: number;
  currency: string;
  availableStock: number | null;
};

export type PendingCheckoutSession = {
  checkoutSessionId: string;
  eventId: string;
  eventTitle: string;
  eventCode: string;
  eventDateAndTime: { date: string; time: string };
  expiresAt: string;
  promoCode: string | null;
  lines: PendingCheckoutSessionLine[];
  sessionSubtotal: number;
};

// ---- payment methods ---------------------------------------------------

export type PaymentMethodRow = {
  id: string;
  method_type: "momo" | "card";
  // momo: { networkCode, networkName, phone, label? }
  // card: { brand, last4, expiryMonth, expiryYear, authorizationCode, bank?, label? }
  details: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
};

export type AddMomoWalletBody = {
  type: "momo";
  networkCode: string;
  networkName: string;
  phone: string;
  label?: string;
};

export type MomoNetwork = { code: string; name: string };

// ---- payment attempt + verification ----------------------------------

export type CheckoutAttemptBody = {
  checkoutSessionIds: string[];
  paymentMethodId: string;
};

export type PaystackPaymentInfo =
  | {
      mode: "popup";
      reference: string;
      accessCode: string;
      authorizationUrl: string;
    }
  | {
      mode: "direct";
      reference: string;
      chargeStatus: string;
      displayMessage?: string;
    };

export type CheckoutAttemptResult =
  | {
      status: 200;
      data: {
        paymentGroupId: string;
        // payment_attempt rows — only `id` is read by the app
        attempts: { id: string }[];
        paystack: PaystackPaymentInfo;
      };
    }
  | { status: 400 | 401 | 404 | 500; message: string }
  | { status: 409; message: string; invalidSessionIds: string[] };

export type VerifyPaymentResult =
  | { status: 200; data: { finalized: "succeeded" } }
  | {
      status: 202;
      data: { finalized: "pending" | "already_processing" };
      message?: string;
    }
  | { status: 400; data: { finalized: "failed" }; message: string }
  | {
      status: 207;
      data: { finalized: "fulfillment_failed"; paymentAttemptId: string };
      message: string;
    }
  | { status: 401 | 403 | 404 | 500; message: string };

export type SubmitChargeOtpResult =
  | { status: 200; data: { chargeStatus: string } }
  | { status: 400 | 401 | 403 | 404 | 500; message: string };

// ---- organizer (read-only surfaces) ----------------------------------

export type OrganizerDashboardPeriod = "today" | "7d" | "30d" | "all";

// One row of get_organizer_dashboard_overview, one per sales currency (plus
// a single all-zero row when the organizer has no paid checkouts yet). The
// *_events_count columns are identical on every row. PostgREST can serialise
// the bigint columns as strings, so the app coerces with Number() on read.
export type OrganizerOverviewRow = {
  currency: string | null;
  gross_sales: number;
  total_discount: number;
  distinct_purchasers: number;
  paid_orders: number;
  tickets_sold: number;
  tickets_cancelled: number;
  registrations: number;
  active_events_count: number;
  upcoming_events_count: number;
  total_events_count: number;
};

export type OrganizerOverviewResult =
  | {
      status: 200;
      data: {
        current: OrganizerOverviewRow[];
        previous: OrganizerOverviewRow[] | null;
      };
    }
  | { status: 401 | 500; message: string };

export type OrganizerFinanceResult =
  | { status: 200; data: OrganizerFinanceOverviewRow[] }
  | { status: 401 | 500; message: string };

// ---- organizer write actions ----------------------------------------

export type PayoutAccountsResult =
  | { status: 200; data: PayoutAccountRow[] }
  | { status: 401 | 500; message: string };

export type PayoutsResult =
  | { status: 200; data: OrganizerPayoutRow[] }
  | { status: 401 | 500; message: string };

export type AddMobileMoneyPayoutBody = {
  accountType: "mobile_money";
  accountHolderName: string;
  networkCode: string;
  networkName: string;
  phone: string;
};

export type AddBankPayoutBody = {
  accountType: "bank";
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
};

// Structural mirror of @abonten/validation addPayoutAccountSchema — the
// route re-validates with the real Zod schema, so this stays dependency-free.
export type AddPayoutAccountBody = AddMobileMoneyPayoutBody | AddBankPayoutBody;

export type AddPayoutAccountResult =
  | { status: 200; data: PayoutAccountRow }
  | { status: 400 | 401 | 500; message: string };

export type MutatePayoutAccountResult = {
  status: 200 | 400 | 401 | 404 | 500;
  message: string;
};

export type RequestPayoutBody = {
  payoutAccountId: string;
  amount: number;
  currency: string;
};

export type RequestPayoutResult =
  | { status: 200; data: { payoutId: string; reference: string } }
  | { status: 400 | 401 | 500; message: string; balanceStale?: boolean };

export type EventCancellationImpact = {
  paidTicketCount: number;
  freeTicketCount: number;
  attendeeCount: number;
};

export type EventCancellationImpactResult =
  | { status: 200; data: EventCancellationImpact }
  | { status: 400 | 401 | 403 | 404 | 500; message: string };

export type CancelEventResult =
  | {
      status: 200;
      message: string;
      data: { refundsInitiated: number; refundsFailedToStart: number };
    }
  | { status: 400 | 401 | 403 | 409 | 500; message: string };

// ---- devices (push notifications) -----------------------------------

export type DeviceRegisterBody = {
  token: string;
  platform: "ios" | "android";
};

export type DeviceTokenResult = {
  status: 200 | 400 | 401 | 500;
  message: string;
};
