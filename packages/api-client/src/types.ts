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
