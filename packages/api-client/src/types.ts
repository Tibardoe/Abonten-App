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
import type {
  PlaceOpeningHoursInput,
  PlaceServiceInput,
} from "@abonten/types/placeType";
import type {
  EventPromotionTier,
  UserPostType,
} from "@abonten/types/postsType";

// Every mobile API route replies with this envelope (mirrors the web Server
// Action convention). The HTTP status code always equals `status`.
export type ApiEnvelope<T> = {
  status: number;
  message?: string;
  data?: T;
};

export type {
  EventPromotionTier,
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
  | "event_flyer"
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

// ---- place creation ----------------------------------------------------
// postPlaceCore. The cover photo is uploaded from the device first (signed
// direct upload, kind "place_photo"); its public_id/version are passed
// here. `clientRequestId` is generated once per submission and reused
// across retries so a replay returns the same place instead of a
// duplicate. Flat reply: 200 = published (carries placeId/slug); 400 =
// validation; 500 = create failed (retry-friendly).
export type { PlaceOpeningHoursInput, PlaceServiceInput };

export type PlaceCreateBody = {
  name: string;
  categoryId: number;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  coverPublicId: string;
  coverVersion: string;
  clientRequestId: string;
  openingHours: PlaceOpeningHoursInput[];
  websiteUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  socialLinks?: Record<string, string> | null;
  services?: PlaceServiceInput[] | null;
  draftId?: string | null;
};

export type PlaceCreateResult =
  | { status: number; message?: string }
  | { status: 200; message?: string; placeId: string; slug: string };

// ---- event creation --------------------------------------------------
// postEventCore. The flyer is uploaded from the device first (signed direct
// upload, kind "event_flyer"); its public_id/version are passed here.
// Provide a single start/end range (startsAt + endsAt, ISO) OR a list of
// specific date entries (specificDates), never both. Ticketing is free, a
// single paid tier, or multiple named tiers. Flat reply: 200 = published
// (carries eventId); 400 = validation; 409 = a promo code already exists on
// this event; 500 = create failed (retry-friendly).
export type EventCreateBody = {
  title: string;
  description: string;
  category: string;
  types: string[];
  address: string;
  latitude: number;
  longitude: number;
  requireRegistration: boolean;
  currency: string;
  flyerPublicId: string;
  flyerVersion: string;
  clientRequestId: string;
  capacity?: number | null;
  websiteUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  specificDates?: { start: string; end: string }[] | null;
  freeEvent?: boolean;
  singleTicket?: { price: number; quantity: number | null } | null;
  multipleTickets?:
    | {
        type: string;
        price: number;
        quantity: number | null;
        availableFrom?: string | null;
        availableUntil?: string | null;
      }[]
    | null;
  promoCodes?:
    | {
        promoCode: string;
        discount: number;
        maximumUse: number;
        expiryDate: string;
      }[]
    | null;
  placeId?: string | null;
};

export type EventCreateResult =
  | { status: number; message?: string }
  | { status: 200; message?: string; eventId: string };

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

// initCardVerificationCore result data. Open `authorizationUrl` in a
// browser session; pass `reference` back to confirmCard() once it closes.
export type CardVerificationInitData = {
  reference: string;
  accessCode: string;
  authorizationUrl: string;
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

// ---- event insights (per-event analytics, read-only) ----------------
//
// The underlying get_event_*_analytics RPCs have no generated types; the
// PostgREST layer can serialise their bigint/numeric columns as strings, so
// the mobile screen coerces every numeric field with Number() on read (same
// convention as OrganizerOverviewRow above).

export type EventInsightsOverview = {
  event_title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  require_registration: boolean;
  capacity: number | null;
  currency: string | null;
  tickets_sold: number;
  tickets_cancelled: number;
  gross_sales: number;
  total_discount: number;
  promo_purchase_count: number;
  distinct_attendees: number;
  capacity_remaining: number | null;
};

export type EventInsightsFinance = {
  currency: string;
  ticketSales: number;
  platformFee: number;
  refunds: number;
  netSales: number;
  pendingRefunds: number;
  completedRefunds: number;
  refundRequestCount: number;
  organizerEarnings: number;
  settled: boolean;
};

export type EventInsightsTicketTypeRow = {
  ticket_type_id: string;
  type: string;
  sold: number;
  quantity_capacity: number | null;
  percent_sold: number | null;
  price: number;
  currency: string | null;
  revenue: number;
  cancelled: number;
};

export type EventInsightsPromoRow = {
  promo_code: string;
  orders: number;
  units_discounted: number;
  total_discount: number;
};

export type EventInsightsDateRow = {
  occurrence_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  tickets_sold: number;
  tickets_cancelled: number;
};

export type EventInsightsReturning = {
  returning_count: number;
  first_time_count: number;
};

export type EventInsightsResult =
  | {
      status: 200;
      data: {
        overview: EventInsightsOverview | null;
        finance: EventInsightsFinance | null;
        ticketTypes: EventInsightsTicketTypeRow[];
        promos: EventInsightsPromoRow[];
        dates: { rows: EventInsightsDateRow[]; hasOccurrences: boolean };
        returning: EventInsightsReturning;
      };
    }
  | { status: 401 | 403 | 500; message: string };

// ---- per-event edit (core, non-ticketing fields) --------------------

export type EventForEditData = {
  id: string;
  title: string;
  description: string;
  address: { full_address?: string } | null;
  capacity: number | null;
  website_url: string | null;
  event_category: string | null;
  event_type: string[] | string | null;
  require_registration: boolean | null;
  featured: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
  flyer_public_id: string;
  flyer_version: string;
  event_occurrence: { id: string; starts_at: string; ends_at: string }[] | null;
  ticket_type:
    | {
        id: string;
        type: string;
        price: number;
        quantity: number | null;
        currency: string | null;
        available_from: string | null;
        available_until: string | null;
      }[]
    | null;
};

export type EventEditContextResult =
  | {
      status: 200;
      data: { event: EventForEditData; hasConfirmedParticipation: boolean };
    }
  | { status: 401 | 404 | 500; message: string };

export type UpdateEventBody = {
  title: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  category: string;
  types: string[];
  /** require_registration */
  checked: boolean;
  capacity?: number | null;
  websiteUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  specificDates?: { start: string; end: string }[] | null;
  /** Omit both to keep the current flyer. */
  flyerPublicId?: string | null;
  flyerVersion?: string | null;
};

export type UpdateEventResult =
  | { status: 200; message?: string; eventCode?: string }
  | { status: 400 | 401 | 404 | 409 | 500; message: string };

// The event's ticket types, replaced wholesale. Editable only until the
// event's first confirmed ticket (409 after — hasConfirmedParticipation).
// Free, a single paid tier, or multiple named tiers — mirrors EventCreateBody.
export type UpdateEventTicketTypesBody = {
  currency?: string | null;
  freeEvent?: boolean;
  singleTicket?: { price: number; quantity: number | null } | null;
  multipleTickets?:
    | {
        type: string;
        price: number;
        quantity: number | null;
        availableFrom?: string | null;
        availableUntil?: string | null;
      }[]
    | null;
};

export type UpdateEventTicketTypesResult =
  | { status: 200; message?: string }
  | { status: 400 | 401 | 404 | 409 | 500; message: string };

// ---- per-event promotion (paid "Feature this event") ----------------

export type EventPromotionContext = {
  tiers: EventPromotionTier[];
  currentPromotion: { ends_at: string; tierLabel: string | null } | null;
  eligibility: {
    eventStatus: string | null;
    ended: boolean;
    soldOut: boolean;
  };
};

export type EventPromotionContextResult =
  | { status: 200; data: EventPromotionContext }
  | { status: 401 | 403 | 404 | 500; message: string };

export type PromoteEventResult =
  | {
      status: 200;
      data: {
        checkoutId: string;
        tierLabel: string;
        amount: number;
        currency: string;
      };
    }
  | { status: 400 | 401 | 403 | 404 | 500; message: string };

// Same discriminated Paystack shape the ticket checkout attempt returns; the
// screen opens `authorizationUrl` (popup) or approves on-device (direct),
// then polls the shared /api/mobile/payments/verify.
export type PromotionPaymentAttemptResult =
  | {
      status: 200;
      data: {
        attempt: {
          id: string;
          status: string;
          amount: number;
          currency: string;
        };
        paystack:
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
      };
    }
  | { status: 400 | 401 | 404 | 410 | 500; message: string };

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
