// One-time-code delivery by text message, per market. Twilio Verify
// generates and checks its own codes; for Hubtel, Abonten makes the code and
// Hubtel's SMS API carries it (hubtelOtpProvider.ts). Either way only a
// server-side handle is stored (a Verification SID, or a random handle plus
// an HMAC of the code) and the person's answer is checked against it. Which
// provider a number uses is decided by the market of the number's country
// (market.otp_provider).

import type { OtpProviderCode } from "@abonten/core/market/types";

export type OtpSendResult =
  | { ok: true; requestId: string; prefix: string }
  | {
      ok: false;
      message: string;
      reason?: "not_configured" | "provider_error" | "unsupported_number";
      /** What the provider said, for monitoring (otpSendMonitoring.ts). */
      detail?: string;
    };

export type OtpVerifyResult = { ok: true } | { ok: false; message: string };

/**
 * Who issued a pending code: a market's provider, or the fixed-code
 * sign-in for app store reviewers (appReviewOtpProvider), which no market
 * can select.
 */
export type OtpSenderCode = OtpProviderCode | "app_review";

export interface OtpProvider {
  readonly code: OtpSenderCode;
  /** Credentials present in the environment (never the values). */
  isConfigured(): boolean;
  /** Which env variables it needs — for readiness reports. */
  requiredEnv(): string[];
  send(phoneE164: string, countryCode: string): Promise<OtpSendResult>;
  verify(
    requestId: string,
    prefix: string,
    code: string,
  ): Promise<OtpVerifyResult>;
  /** Length of the code the provider sends. */
  codeLength(): number;
}
