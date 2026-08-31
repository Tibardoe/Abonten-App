import type { NotificationType } from "@abonten/types/notificationType";
import type { PaginatedResult } from "@abonten/types/pagination";

// Every mobile API route replies with this envelope (mirrors the web Server
// Action convention). The HTTP status code always equals `status`.
export type ApiEnvelope<T> = {
  status: number;
  message?: string;
  data?: T;
};

export type { NotificationType, PaginatedResult };

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
