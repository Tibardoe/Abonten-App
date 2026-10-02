import type { CoreTranslator } from "./i18n/translator";

// Shared between verifyPhoneSignIn.ts and updateVerifiedPhone.ts, which
// otherwise had these copy-pasted independently -- keeping them here avoids
// the wording drifting apart between sign-in and phone-update OTP checks.
// The words live under `otp.*` of the core namespace.
export type OtpMessage = "invalidFormat" | "expired" | "tooManyAttempts";

export function otpMessage(t: CoreTranslator, message: OtpMessage): string {
  return t(`otp.${message}`);
}
