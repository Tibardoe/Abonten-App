// The number of digits in a text-message code depends on the provider the
// market uses (Hubtel sends 4, Twilio Verify 6). The send response carries
// the real `codeLength`; this is only the fallback the OTP box shows before
// a code has been requested. Plain constants (no server-only code) so it's
// safe to import from "use client" files.
export const DEFAULT_PHONE_OTP_CODE_LENGTH = 4;
