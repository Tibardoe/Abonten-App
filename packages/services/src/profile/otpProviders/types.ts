// One-time-code delivery by text message, per market. The provider
// generates and checks the code itself (Hubtel's OTP API, Twilio Verify):
// Abonten only ever stores the provider's request handle server-side and
// forwards the person's answer. Which provider a number uses is decided by
// the market of the number's country (market.otp_provider).

import type { OtpProviderCode } from "@abonten/core/market/types";

export type OtpSendResult =
  | { ok: true; requestId: string; prefix: string }
  | {
      ok: false;
      message: string;
      reason?: "not_configured" | "provider_error" | "unsupported_number";
    };

export type OtpVerifyResult = { ok: true } | { ok: false; message: string };

export interface OtpProvider {
  readonly code: OtpProviderCode;
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
