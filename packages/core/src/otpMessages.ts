// Shared between verifyPhoneSignIn.ts and updateVerifiedPhone.ts, which
// otherwise had these copy-pasted independently -- keeping them here avoids
// the wording drifting apart between sign-in and phone-update OTP checks.
export const OTP_MESSAGES = {
  invalidFormat: "Enter the code we sent you.",
  expired: "That code has expired. Please request a new one.",
  tooManyAttempts: "Too many incorrect attempts. Please request a new code.",
} as const;
