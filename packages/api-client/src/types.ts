import type { NotificationType } from "@abonten/types/notificationType";
import type {
  OrganizerFinanceOverviewRow,
  OrganizerLedgerTransactionRow,
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
  PaginatedResult,
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
